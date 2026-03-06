export const defaultGradient =
  "linear-gradient(135deg, #0f172a 0%, #1e1b4b 30%, #312e81 50%, #1e1b4b 70%, #0f172a 100%)";

export const fullPageGradient = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: defaultGradient,
} as const;
