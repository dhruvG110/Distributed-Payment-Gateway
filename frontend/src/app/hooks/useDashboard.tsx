import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { walletApi, paymentApi, notificationApi, api } from "../lib/api";

// Wallet details and balance
export const useWallet = () => {
  return useQuery({
    queryKey: ["wallet"],
    queryFn: async () => {
      const { data } = await walletApi.get("/me");
      return data.wallet;
    },
    retry: false,
  });
};

// Create wallet
export const useCreateWallet = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await walletApi.post("/create", {});
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["wallet"],
      });
    },
  });
};

// Wallet activity
export const useWalletTransactions = () => {
  return useQuery({
    queryKey: ["wallet-transactions"],
    queryFn: async () => {
      const { data } = await walletApi.get("/transactions");
      return data.transactions;
    },
  });
};

// Payment history
export const usePayments = () => {
  return useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data } = await paymentApi.get("/");
      return data.payments;
    },
    refetchInterval: (query) => {
      const payments = query.state.data ?? [];

      const hasProcessingPayment = payments.some(
        (payment: any) => payment.status === "processing"
      );

      return hasProcessingPayment ? 3000 : false;
    },
  });
};

// Notifications
export const useNotifications = () => {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data } = await notificationApi.get("/");
      return data.notifications;
    },
  });
};

// Unread notification count
export const useUnreadCount = () => {
  return useQuery({
    queryKey: ["unread-count"],
    queryFn: async () => {
      const { data } = await notificationApi.get("/unread-count");
      return data.unread_count;
    },
  });
};

// Create payment
export const useCreatePayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payment: {
      sender_wallet_id: string;
      receiver_wallet_id: string;
      amount: string;
    }) => {
      const idempotencyKey = crypto.randomUUID();

      const { data } = await paymentApi.post("/", payment, {
        headers: {
          "Idempotency-Key": idempotencyKey,
        },
      });

      return data;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["payments"],
      });

      queryClient.invalidateQueries({
        queryKey: ["wallet"],
      });
    },
  });
};

// Fetch individual payment details
export const usePaymentDetails = (paymentId: string) => {
  return useQuery({
    queryKey: ["payment", paymentId],
    queryFn: async () => {
      const { data } = await paymentApi.get(`/${paymentId}`);
      return data.payment;
    },
    enabled: !!paymentId,
  });
};

// Cancel payment
export const useCancelPayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (paymentId: string) => {
      const { data } = await paymentApi.post(`/${paymentId}/cancel`);
      return data;
    },

    onSuccess: (_, paymentId) => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payment", paymentId] });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
    },
  });
};

// Mark individual notification as read
export const useMarkNotificationRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { data } = await notificationApi.patch(`/${notificationId}/read`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["notifications"],
      });
      queryClient.invalidateQueries({
        queryKey: ["unread-count"],
      });
    },
  });
};

// Mark all notifications as read
export const useMarkAllNotificationsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await notificationApi.patch("/read-all");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["notifications"],
      });
      queryClient.invalidateQueries({
        queryKey: ["unread-count"],
      });
    },
  });
};

// Delete notification
export const useDeleteNotification = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { data } = await notificationApi.delete(`/${notificationId}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["notifications"],
      });
      queryClient.invalidateQueries({
        queryKey: ["unread-count"],
      });
    },
  });
};

// Freeze wallet
export const useFreezeWallet = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await walletApi.patch("/freeze");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["wallet"],
      });
    },
  });
};

// Unfreeze wallet
export const useUnfreezeWallet = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await walletApi.patch("/unfreeze");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["wallet"],
      });
    },
  });
};

// Get currently authenticated user
export const useCurrentUser = () => {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await api.get("/me");
      return data.user;
    },
    retry: false,
    staleTime: 60 * 1000,
  });
};

