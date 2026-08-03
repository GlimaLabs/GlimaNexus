import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

type Status = "idle" | "checking" | "available" | "downloading" | "error";

export default function UpdateBanner() {
  const [status, setStatus] = useState<Status>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setStatus("checking");
    check()
      .then((result) => {
        if (result?.available) {
          setUpdate(result);
          setStatus("available");
        } else {
          setStatus("idle");
        }
      })
      .catch((err) => {
        setErrorMessage(String(err));
        setStatus("error");
      });
  }, []);

  async function installUpdate() {
    if (!update) return;
    setStatus("downloading");
    let downloaded = 0;
    let total = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total > 0) setProgress(Math.round((downloaded / total) * 100));
        }
      });
      await relaunch();
    } catch (err) {
      setErrorMessage(String(err));
      setStatus("error");
    }
  }

  if (status === "idle" || status === "checking") return null;

  return (
    <div className="nx-update-banner">
      {status === "available" && update && (
        <>
          <span>
            Update verfügbar: <strong>v{update.version}</strong>
          </span>
          <button className="nx-update-btn" onClick={installUpdate}>
            Jetzt installieren
          </button>
        </>
      )}
      {status === "downloading" && <span>Update wird installiert… {progress}%</span>}
      {status === "error" && <span className="nx-update-error">Update-Prüfung fehlgeschlagen: {errorMessage}</span>}
    </div>
  );
}
