import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { useAuth } from "../../hooks/useAuth";
import { fullPageGradient } from "../../styles/shared";
import { WelcomeStep } from "./WelcomeStep";
import { CreateAccountStep } from "./CreateAccountStep";

type Step = "welcome" | "createAccount";

export function OnboardingPage() {
  const navigate = useNavigate();
  const { hasUser, hasUserLoading } = useAuth();
  const [step, setStep] = useState<Step>("welcome");

  useEffect(() => {
    if (hasUserLoading) return;
    if (hasUser) {
      navigate("/", { replace: true });
    }
  }, [hasUser, hasUserLoading, navigate]);

  if (hasUserLoading || hasUser) {
    return (
      <Box sx={fullPageGradient}>
        <CircularProgress sx={{ color: "primary.main" }} />
      </Box>
    );
  }

  return (
    <Box sx={fullPageGradient}>
      {step === "welcome" && (
        <WelcomeStep onNext={() => setStep("createAccount")} />
      )}
      {step === "createAccount" && (
        <CreateAccountStep onNext={() => navigate("/", { replace: true })} />
      )}
    </Box>
  );
}
