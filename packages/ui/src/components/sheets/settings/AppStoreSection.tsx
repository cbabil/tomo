import { useState, type FormEvent } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Link from "@mui/material/Link";
import DeleteIcon from "@mui/icons-material/Delete";
import { useTranslation } from "react-i18next";
import { trpc } from "../../../lib/trpc";

export function AppStoreSection() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const reposQuery = trpc.apps.repos.list.useQuery();
  const addMutation = trpc.apps.repos.add.useMutation({
    onSuccess: () => utils.apps.repos.list.invalidate(),
  });
  const removeMutation = trpc.apps.repos.remove.useMutation({
    onSuccess: () => utils.apps.repos.list.invalidate(),
  });

  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("master");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    const exists = reposQuery.data?.some((r) => r.url === trimmedUrl);
    if (exists) {
      setError(t("settings.appStore.alreadyExists"));
      return;
    }

    try {
      await addMutation.mutateAsync({
        url: trimmedUrl,
        branch: branch.trim() || "master",
      });
      setUrl("");
      setBranch("master");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleRemove = async (repoUrl: string) => {
    try {
      await removeMutation.mutateAsync({ url: repoUrl });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={styles.alert} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {reposQuery.isLoading ? (
        <CircularProgress size={24} />
      ) : (
        <Box sx={styles.repoList}>
          {reposQuery.data?.map((repo) => (
            <Box key={repo.url} sx={styles.repoRow}>
              <Box sx={styles.repoInfo}>
                <Link
                  href={repo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="body2"
                  sx={styles.repoUrl}
                >
                  {repo.url}
                </Link>
                <Box component="span" sx={styles.repoBranch}>
                  {repo.branch}
                </Box>
                {repo.isDefault && (
                  <Chip
                    label={t("settings.appStore.defaultLabel")}
                    size="small"
                    sx={styles.defaultChip}
                  />
                )}
              </Box>
              {!repo.isDefault && (
                <IconButton
                  size="small"
                  onClick={() => handleRemove(repo.url)}
                  disabled={removeMutation.isPending}
                  sx={styles.removeButton}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          ))}
        </Box>
      )}

      <Box component="form" onSubmit={handleAdd} sx={styles.form}>
        <TextField
          label={t("settings.appStore.url")}
          placeholder={t("settings.appStore.urlPlaceholder")}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          fullWidth
          size="small"
        />
        <TextField
          label={t("settings.appStore.branch")}
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          size="small"
          sx={styles.branchField}
        />
        <Button
          type="submit"
          variant="contained"
          color="primary"
          disabled={addMutation.isPending || !url.trim()}
          sx={styles.addButton}
        >
          {addMutation.isPending ? (
            <CircularProgress size={18} sx={{ color: "#fff" }} />
          ) : (
            t("settings.appStore.add")
          )}
        </Button>
      </Box>
    </Box>
  );
}

const styles = {
  alert: {
    borderRadius: 2,
    mb: 2,
  },
  repoList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 1,
    mb: 3,
  },
  repoRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    py: 1,
    px: 1.5,
    borderRadius: 1,
    backgroundColor: "action.hover",
  },
  repoInfo: {
    display: "flex",
    alignItems: "center",
    gap: 1,
    minWidth: 0,
  },
  repoUrl: {
    color: "text.primary",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  repoBranch: {
    color: "text.secondary",
  },
  defaultChip: {
    height: 20,
    fontSize: "0.7rem",
    backgroundColor: "primary.main",
    color: "#fff",
  },
  removeButton: {
    color: "error.main",
  },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  },
  branchField: {
    maxWidth: 200,
  },
  addButton: {
    alignSelf: "flex-start",
  },
};
