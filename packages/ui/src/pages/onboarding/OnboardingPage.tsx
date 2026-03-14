import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { useAuth } from "../../hooks/useAuth";
import { fullPageGradient } from "../../styles/shared";
import { WelcomeStep } from "./WelcomeStep";
import { CreateAccountStep } from "./CreateAccountStep";

const APP_VERSION = __APP_VERSION__;

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
      <Typography
        variant="caption"
        sx={{
          position: "fixed",
          bottom: 16,
          right: 24,
          color: "text.secondary",
          opacity: 0.5,
        }}
      >
        v{APP_VERSION}
      </Typography>
    </Box>
  );
}
