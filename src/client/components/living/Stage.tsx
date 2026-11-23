// The TV stage: frame, screen, status slot. Pages render their own <video>
// (stream binding stays with the page); shared overlays are provided here.
import { useGuideLink } from "../../lib/use-project-link";
import type { ViewerStage } from "../../media/viewer-presentation";
import type { ReactNode } from "react";
import { Glyph, type GlyphName } from "../../ui/icons";
import { useCopy } from "../../ui/copy";
import type { ComicKind } from "./Comic";
import type { ComicTone } from "./comic-presentation";

export function StageTv({
  hasEntry,
  live,
  children,
  label,
  indicator,
}: {
  hasEntry?: boolean;
  live?: boolean;
  children: ReactNode;
  label: string;
  indicator?: ReactNode;
}) {
  return (
    <div className="lr-tv">
      <div
        className={`lr-tv-screen${hasEntry ? " has-entry" : ""}${live ? " is-on" : ""}`}
        role="group"
        aria-label={label}
      >
        {children}
      </div>
      <div className="lr-tv-chin">{indicator}</div>
    </div>
  );
}

export function StaticNoise() {
  return null;
}

export function StageOverlay({
  icon,
  message,
  dim,
  waiting = false,
  progress,
  viewerStage,
  onActivate,
}: {
  icon: GlyphName;
  message: string;
  dim?: boolean;
  waiting?: boolean;
  comic?: ComicKind;
  tone?: ComicTone;
  progress?: string;
  viewerStage?: ViewerStage;
  onActivate?: () => void;
  still?: boolean;
}) {
  const { lang, t } = useCopy();
  const routeFailed = viewerStage === "route-failed";
  const guide = useGuideLink(lang, "no-media-route", routeFailed);
  const isWaiting = waiting && !onActivate;
  const content = (
    <>
      <span className="lr-tv-status-content">
        <Glyph name={isWaiting ? "refresh" : icon} size={28} className={isWaiting ? "lr-spin" : undefined} />
        <span className="lr-tv-msg">{progress ?? message}</span>
      </span>
    </>
  );
  if (onActivate) {
    return (
      <button type="button" className={`lr-tv-overlay${dim ? " is-dim" : ""}`} onClick={onActivate} aria-label={message}>
        {content}
      </button>
    );
  }
  return (
    <div
      // Passive state layer: it must not intercept clicks meant for the
      // playback controls it covers. Only the guide link accepts pointer input.
      className={`lr-tv-overlay is-passive${dim ? " is-dim" : ""}`}
      role="status"
      aria-label={message}
    >
      {content}
      {routeFailed && <a className="lr-tv-route-help" href={guide} target="_blank" rel="noopener noreferrer">
        {t("help.troubleshooting")}
      </a>}
    </div>
  );
}
