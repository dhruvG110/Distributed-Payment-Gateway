"use client";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/app/lib/api";
import {
  useWallet,
  usePayments,
  useNotifications,
  useCreateWallet,
  useCreatePayment,
  usePaymentDetails,
  useCancelPayment,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useDeleteNotification,
  useUnreadCount,
  useFreezeWallet,
  useUnfreezeWallet,
  useWalletTransactions,
  useCurrentUser,
} from "@/app/hooks/useDashboard";
import { useState, useEffect } from "react";

function formatAmount(paise: string | number) {
  const amount = BigInt(paise || 0);
  const rupees = amount / 100n;
  const cents = (amount % 100n).toString().padStart(2, "0");

  return `₹${rupees.toLocaleString("en-IN")}.${cents}`;
}

export default function DashboardPage() {
  const wallet = useWallet();
  const payments = usePayments();
  const notifications = useNotifications();
  const createWallet = useCreateWallet();
  const walletData = wallet.data;
  const paymentData = payments.data ?? [];
  const notificationData = notifications.data ?? [];
  const createPayment = useCreatePayment();

  const [receiverWalletId, setReceiverWalletId] = useState("");
  const [amount, setAmount] = useState("");
  const router = useRouter();
  const [selectedPaymentId, setSelectedPaymentId] = useState("");
  const unreadCount = useUnreadCount();

  const markNotificationRead = useMarkNotificationRead();
  const markAllNotificationsRead = useMarkAllNotificationsRead();
  const deleteNotification = useDeleteNotification();
  const paymentDetails = usePaymentDetails(selectedPaymentId);
  const paymentDetail = paymentDetails.data?.payment ?? paymentDetails.data;
  const cancelPayment = useCancelPayment();
  const logoutMutation = useMutation({
    mutationFn: async () => {
      await api.post("/logout");
    },
    onSuccess: () => {
      router.replace("/auth/login");
    },
  });
  const currentUser = useCurrentUser();

  useEffect(() => {
    if (
      currentUser.isError &&
      (currentUser.error as any)?.response?.status === 401
    ) {
      router.replace("/auth/login");
    }
  }, [currentUser.isError, currentUser.error, router]);
  const freezeWallet = useFreezeWallet();
  const unfreezeWallet = useUnfreezeWallet();

  const walletIsActive = wallet.data?.status === "active";
  const walletIsFrozen = wallet.data?.status === "frozen";

  const walletActionPending =
    freezeWallet.isPending || unfreezeWallet.isPending;
  const walletTransactions = useWalletTransactions();

  if (currentUser.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500">Verifying your session...</p>
      </div>
    );
  }

  if (
    currentUser.isError &&
    (currentUser.error as any)?.response?.status === 401
  ) {
    return null;
  }

  if (currentUser.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-red-600">
          Unable to verify your session. Please try again.
        </p>
      </div>
    );
  }
  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-900">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-10">
          <p className="text-sm text-slate-500">PAYMESH / OVERVIEW</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Dashboard
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Manage your wallet and monitor your payments.
          </p>

          <h1 className="mt-2 text-3xl font-semibold">
            Welcome, {currentUser.data?.name}
          </h1>
          <button
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
          >
            {logoutMutation.isPending ? "Logging out..." : "Logout"}
          </button>
        </header>
        {/* Wallet */}
        {wallet.isLoading ? (
          <p className="mt-4 text-slate-400">Loading wallet...</p>
        ) : wallet.isError &&
          (wallet.error as any)?.response?.status === 404 ? (
          <div className="mt-4">
            <p className="text-sm text-slate-500">
              You don't have a wallet yet.
            </p>

            <button
              onClick={() => createWallet.mutate()}
              disabled={createWallet.isPending}
              className="mt-4 rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {createWallet.isPending ? "Creating wallet..." : "Create Wallet"}
            </button>

            {createWallet.isError && (
              <p className="mt-3 text-sm text-red-600">
                {(createWallet.error as any)?.response?.data?.message ??
                  "Unable to create wallet. Please try again."}
              </p>
            )}
          </div>
        ) : wallet.isError ? (
          <p className="mt-4 text-sm text-red-600">
            Unable to load wallet. Please check your connection or login again.
          </p>
        ) : (
          <>
            <h2 className="mt-3 text-4xl font-semibold">
              {formatAmount(wallet.data?.balance ?? "0")}
            </h2>
            <p className="mt-3 text-xs uppercase tracking-wider text-slate-400">
              {wallet.data?.currency} · {wallet.data?.status}
            </p>

            {/* Wallet Controls */}
            <div className="mt-6 border-t border-slate-200 pt-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Wallet security</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {walletIsActive
                      ? "Your wallet is active and can make payments."
                      : walletIsFrozen
                        ? "Your wallet is frozen. Payments are restricted."
                        : "Wallet status unavailable."}
                  </p>
                </div>

                {walletIsActive && (
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          "Are you sure you want to freeze your wallet?",
                        )
                      ) {
                        freezeWallet.mutate();
                      }
                    }}
                    disabled={walletActionPending}
                    className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {freezeWallet.isPending ? "Freezing..." : "Freeze"}
                  </button>
                )}

                {walletIsFrozen && (
                  <button
                    onClick={() => unfreezeWallet.mutate()}
                    disabled={walletActionPending}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    {unfreezeWallet.isPending ? "Unfreezing..." : "Unfreeze"}
                  </button>
                )}
              </div>

              {(freezeWallet.isError || unfreezeWallet.isError) && (
                <p className="mt-3 text-sm text-red-600">
                  {((freezeWallet.error || unfreezeWallet.error) as any)
                    ?.response?.data?.message ??
                    "Wallet update failed. Please try again."}
                </p>
              )}
            </div>

            {/* Wallet Activity */}
            <section className="mb-10">
              <div className="mb-4">
                <h2 className="text-lg font-semibold">Wallet Activity</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Track changes and events related to your wallet.
                </p>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {walletTransactions.isLoading ? (
                  <p className="p-6 text-sm text-slate-500">
                    Loading wallet activity...
                  </p>
                ) : walletTransactions.isError ? (
                  <p className="p-6 text-sm text-red-600">
                    Unable to load wallet activity.
                  </p>
                ) : !walletTransactions.data?.length ? (
                  <p className="p-8 text-center text-sm text-slate-500">
                    No wallet activity available.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {walletTransactions.data.map((event: any) => (
                      <div
                        key={event.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
                      >
                        <div>
                          <p className="text-sm font-medium capitalize">
                            {(event.event_type ?? "Wallet event").replaceAll(
                              "_",
                              " ",
                            )}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {event.created_at
                              ? new Date(event.created_at).toLocaleString()
                              : "Date unavailable"}
                          </p>
                        </div>

                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                          {event.event_type ?? "Event"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {/* Send Payment */}
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold">Send Payment</h2>

          <form
            className="max-w-xl rounded-xl border border-slate-200 bg-white p-6"
            onSubmit={(e) => {
              e.preventDefault();

              const amountInPaise = Math.round(Number(amount) * 100);

              if (
                !receiverWalletId.trim() ||
                !Number.isFinite(amountInPaise) ||
                amountInPaise <= 0 ||
                !/^\d+(\.\d{1,2})?$/.test(amount)
              ) {
                return;
              }

              createPayment.mutate({
                sender_wallet_id: wallet.data.id,
                receiver_wallet_id: receiverWalletId.trim(),
                amount: String(amountInPaise),
              });
            }}
          >
            <div className="mb-5">
              <label className="mb-2 block text-sm font-medium">
                Receiver Wallet ID
              </label>

              <input
                value={receiverWalletId}
                onChange={(e) => setReceiverWalletId(e.target.value)}
                placeholder="Enter receiver wallet ID"
                required
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="mb-5">
              <label className="mb-2 block text-sm font-medium">
                Amount (INR)
              </label>

              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                required
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <button
              type="submit"
              disabled={
                createPayment.isPending ||
                !wallet.data ||
                wallet.data.status !== "active"
              }
              className="w-full rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createPayment.isPending ? "Processing..." : "Send Payment"}
            </button>

            {createPayment.isSuccess && (
              <p className="mt-4 text-sm text-green-700">
                Payment request submitted successfully.
              </p>
            )}

            {createPayment.isError && (
              <p className="mt-4 text-sm text-red-600">
                {(createPayment.error as any)?.response?.data?.message ??
                  "Payment failed. Please try again."}
              </p>
            )}
          </form>
        </section>

        {/* Payments */}
        <section className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent payments</h2>
            <span className="text-sm text-slate-500">
              {paymentData.length} records
            </span>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {payments.isLoading ? (
              <p className="p-6 text-sm text-slate-500">Loading payments...</p>
            ) : payments.isError ? (
              <p className="p-6 text-sm text-red-600">
                Could not load payments.
              </p>
            ) : paymentData.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">
                No payments yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-6 py-4">Payment ID</th>
                      <th className="px-6 py-4">Amount</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paymentData.map((payment: any) => (
                      <tr key={payment.id}>
                        <td className="px-6 py-4 font-mono text-xs">
                          {payment.id}
                        </td>
                        <td className="px-6 py-4 font-medium">
                          {formatAmount(payment.amount)}
                        </td>
                        <td className="px-6 py-4">{payment.status}</td>
                        <td className="px-6 py-4 text-slate-500">
                          {payment.created_at
                            ? new Date(payment.created_at).toLocaleDateString()
                            : payment.createdAt
                              ? new Date(payment.createdAt).toLocaleDateString()
                              : "—"}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-3">
                            <button
                              onClick={() => setSelectedPaymentId(payment.id)}
                              className="text-sm font-medium underline"
                            >
                              View
                            </button>

                            <button
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Are you sure you want to cancel this payment?",
                                  )
                                ) {
                                  cancelPayment.mutate(payment.id);
                                }
                              }}
                              disabled={cancelPayment.isPending}
                              className="text-sm font-medium text-red-600 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {selectedPaymentId && (
            <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {paymentDetails.isLoading ? (
                <div className="p-12 text-center">
                  <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
                  <p className="mt-4 text-sm text-slate-500">
                    Loading transaction details...
                  </p>
                </div>
              ) : paymentDetails.isError ? (
                <div className="p-8">
                  <p className="text-sm font-medium text-red-600">
                    Unable to load payment details.
                  </p>
                  <button
                    onClick={() => setSelectedPaymentId("")}
                    className="mt-4 text-sm font-medium text-slate-600 underline"
                  >
                    Close
                  </button>
                </div>
              ) : paymentDetail ? (
                <>
                  {(() => {
                    const status = String(
                      paymentDetail.status ?? "unknown",
                    ).toLowerCase();

                    const statusStyle =
                      status === "completed" || status === "success"
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                        : status === "failed" || status === "cancelled"
                          ? "bg-red-50 text-red-700 ring-red-600/20"
                          : status === "processing"
                            ? "bg-blue-50 text-blue-700 ring-blue-600/20"
                            : "bg-amber-50 text-amber-700 ring-amber-600/20";

                    const createdAt =
                      paymentDetail.created_at ?? paymentDetail.createdAt;

                    const DetailItem = ({
                      label,
                      value,
                      mono = false,
                    }: {
                      label: string;
                      value?: string | number | null;
                      mono?: boolean;
                    }) => (
                      <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                          {label}
                        </p>
                        <p
                          className={`mt-2 break-all text-sm font-medium text-slate-800 ${mono ? "font-mono text-xs" : ""}`}
                        >
                          {value !== undefined && value !== null && value !== ""
                            ? String(value)
                            : "—"}
                        </p>
                      </div>
                    );

                    return (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-5">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-widest text-slate-400">
                              Transaction overview
                            </p>
                            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
                              Payment Details
                            </h2>
                          </div>

                          <button
                            onClick={() => setSelectedPaymentId("")}
                            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                          >
                            Close
                          </button>
                        </div>

                        <div className="bg-slate-50/70 px-6 py-8">
                          <div className="flex flex-wrap items-center justify-between gap-5">
                            <div>
                              <p className="text-sm text-slate-500">
                                Transaction amount
                              </p>
                              <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
                                {formatAmount(paymentDetail.amount ?? "0")}
                              </p>
                              <p className="mt-2 text-xs text-slate-400">
                                {paymentDetail.currency ?? "INR"}
                              </p>
                            </div>

                            <span
                              className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold capitalize ring-1 ring-inset ${statusStyle}`}
                            >
                              <span className="mr-2 h-1.5 w-1.5 rounded-full bg-current" />
                              {status.replaceAll("_", " ")}
                            </span>
                          </div>
                        </div>

                        <div className="grid gap-7 px-6 py-7 sm:grid-cols-2">
                          <DetailItem
                            label="Transaction ID"
                            value={paymentDetail.id}
                            mono
                          />

                          <DetailItem
                            label="Date and time"
                            value={
                              createdAt &&
                              !Number.isNaN(new Date(createdAt).getTime())
                                ? new Date(createdAt).toLocaleString("en-IN", {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  })
                                : "—"
                            }
                          />

                          <DetailItem
                            label="Sender wallet"
                            value={paymentDetail.sender_wallet_id}
                            mono
                          />

                          <DetailItem
                            label="Receiver wallet"
                            value={paymentDetail.receiver_wallet_id}
                            mono
                          />

                          <DetailItem
                            label="Currency"
                            value={paymentDetail.currency ?? "INR"}
                          />

                          <DetailItem
                            label="Payment status"
                            value={status.replaceAll("_", " ")}
                          />
                        </div>

                        {(paymentDetail.failure_reason ||
                          paymentDetail.reason) && (
                          <div className="mx-6 mb-6 rounded-xl border border-red-100 bg-red-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wider text-red-600">
                              Failure information
                            </p>
                            <p className="mt-2 text-sm text-red-700">
                              {paymentDetail.failure_reason ??
                                paymentDetail.reason}
                            </p>
                          </div>
                        )}

                        <div className="border-t border-slate-100 px-6 py-4">
                          <p className="text-xs text-slate-400">
                            Transaction information retrieved from PayMesh.
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </>
              ) : (
                <p className="p-8 text-sm text-slate-500">
                  No transaction details found.
                </p>
              )}
            </section>
          )}
        </section>

        {/* Notifications */}

        {/* Notifications */}
        <section className="mb-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Notifications</h2>
              <p className="mt-1 text-sm text-slate-500">
                Stay updated with your payment activity.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium">
                {unreadCount.isLoading
                  ? "..."
                  : `${unreadCount.data ?? 0} unread`}
              </span>

              <button
                onClick={() => markAllNotificationsRead.mutate()}
                disabled={
                  markAllNotificationsRead.isPending || !unreadCount.data
                }
                className="text-sm font-medium text-slate-700 underline disabled:opacity-40"
              >
                {markAllNotificationsRead.isPending
                  ? "Updating..."
                  : "Mark all as read"}
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {notifications.isLoading ? (
              <p className="p-6 text-sm text-slate-500">
                Loading notifications...
              </p>
            ) : notifications.isError ? (
              <p className="p-6 text-sm text-red-600">
                Unable to load notifications.
              </p>
            ) : notificationData.length === 0 ? (
              <div className="p-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                  <span className="text-xl">🔔</span>
                </div>
                <p className="font-medium">You're all caught up</p>
                <p className="mt-1 text-sm text-slate-500">
                  No notifications available.
                </p>
              </div>
            ) : (
              notificationData.map((notification: any) => (
                <div
                  key={notification.id}
                  className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 p-5 last:border-0 hover:bg-slate-50"
                >
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-slate-300" />

                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {notification.title ?? "Notification"}
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        {notification.message ?? ""}
                      </p>

                      <p className="mt-2 text-xs text-slate-400">
                        {notification.created_at
                          ? new Date(notification.created_at).toLocaleString()
                          : "Date unavailable"}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      onClick={() =>
                        markNotificationRead.mutate(notification.id)
                      }
                      disabled={markNotificationRead.isPending}
                      className="text-xs font-medium text-slate-700 underline disabled:opacity-40"
                    >
                      Mark read
                    </button>

                    <button
                      onClick={() => {
                        if (window.confirm("Delete this notification?")) {
                          deleteNotification.mutate(notification.id);
                        }
                      }}
                      disabled={deleteNotification.isPending}
                      className="text-xs font-medium text-red-600 underline disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {(markNotificationRead.isError ||
            markAllNotificationsRead.isError ||
            deleteNotification.isError) && (
            <p className="mt-3 text-sm text-red-600">
              An action failed. Please try again.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
