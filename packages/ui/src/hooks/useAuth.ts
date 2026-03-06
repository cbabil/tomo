import { useCallback } from "react";
import { trpc } from "../lib/trpc";

export function useAuth() {
  const meQuery = trpc.user.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const hasUserQuery = trpc.user.hasUser.useQuery(undefined, {
    retry: false,
  });

  const loginMutation = trpc.user.login.useMutation();
  const logoutMutation = trpc.user.logout.useMutation();

  const isLoading = meQuery.isLoading;
  const isAuthenticated = meQuery.isSuccess && Boolean(meQuery.data);
  const userName = meQuery.data?.name ?? null;

  const login = useCallback(
    async (password: string) => {
      await loginMutation.mutateAsync({ password });
      await meQuery.refetch();
    },
    [loginMutation, meQuery],
  );

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
    meQuery.refetch();
  }, [logoutMutation, meQuery]);

  return {
    isAuthenticated,
    isLoading,
    userName,
    hasUser: hasUserQuery.data ?? false,
    hasUserLoading: hasUserQuery.isLoading,
    login,
    logout,
    loginError: loginMutation.error?.message ?? null,
    isLoggingIn: loginMutation.isPending,
  };
}
