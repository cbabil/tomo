import { createBrowserRouter, Navigate } from "react-router-dom";
import { LoginPage } from "../pages/login/LoginPage";
import { OnboardingPage } from "../pages/onboarding/OnboardingPage";
import { DesktopPage } from "../pages/desktop/DesktopPage";

/**
 * Route guards are handled within each page component
 * using the useAuth hook, since tRPC queries need React context.
 */
export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/onboarding",
    element: <OnboardingPage />,
  },
  {
    path: "/",
    element: <DesktopPage />,
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
