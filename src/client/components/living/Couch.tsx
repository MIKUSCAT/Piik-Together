import type { ReactNode } from "react";
import { Glyph } from "../../ui/icons";
import { useCopy } from "../../ui/copy";
import type { StatusDescriptor } from "../../ui/media-status";
import type { RoomVoiceState } from "../../../shared/protocol";
import { describeVoiceParticipant } from "../../room-voice/participant-presentation";
export interface CouchEntry {
  key: string;
  name: string;
  status: StatusDescriptor;
  you?: boolean;
  selectable?: boolean;
  collaboration?: boolean;
}

export interface CouchHostEntry {
  key: string;
  name: string;
  you?: boolean;
  selected?: boolean;
  controls?: string;
  onSelect?: () => void;
}

export interface CouchProps {
  view: "host" | "viewer";
  host?: CouchHostEntry | null;
  entries: CouchEntry[];
  voiceState?: RoomVoiceState | null;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  footerAction?: ReactNode;
  participantAction?: {
    open: (key: string, trigger: HTMLButtonElement) => void;
    target: string | null;
    controls: string;
  };
}

export function Couch({ host, entries, voiceState, selectedKey, onSelect, participantAction, footerAction }: CouchProps) {
  const { t, lang } = useCopy();
  const comma = lang === "zh" ? "，" : ", ";
  const people = [
    ...(host ? [{ key: host.key, name: host.name, you: host.you, host: true,
      selected: host.selected, onSelect: host.onSelect, controls: host.controls,
      tone: "live", status: undefined, selectable: Boolean(host.onSelect), collaboration: false }] : []),
    ...entries.map(entry => ({ ...entry, host: false, selected: selectedKey === entry.key,
      onSelect: () => onSelect?.(entry.key), controls: undefined, tone: entry.status.tone })),
  ];
  return <div className="together-roster">
    <div className="together-people" role="group" aria-label={t("common.viewers")}>
      {people.map(person => {
        const voice = describeVoiceParticipant(voiceState?.enabled
          ? voiceState.members.find(member => member.peerId === person.key) : undefined);
        const label = [
          person.name,
          person.host && person.name !== t("common.host") ? t("common.host") : null,
          person.you ? t("common.you") : null,
          person.status ? t(person.status.labelKey) : null,
          voice.appearance ? t(voice.label) : null,
        ].filter(Boolean).join(comma);
        const contents = <>
          <span className="together-avatar" aria-hidden="true">{Array.from(person.name)[0] ?? "P"}</span>
          <span>{person.name}</span>
          {person.host && <Glyph name="cast" size={15} />}
          {voice.appearance && <Glyph name={voice.appearance.microphone ? "microphone" : "microphoneOff"} size={15} />}
          {person.collaboration && <Glyph name="gamepad" size={15} />}
          <i className="together-person-status" data-tone={person.tone} aria-hidden="true" />
        </>;
        const interactive = participantAction || person.selectable !== false;
        return <span key={person.key} data-room-peer={person.key}>
          {interactive ? <button type="button" className="together-person" aria-label={label}
            aria-pressed={participantAction ? undefined : person.selected}
            aria-expanded={participantAction ? participantAction.target === person.key : undefined}
            aria-controls={participantAction?.controls ?? person.controls}
            onClick={event => participantAction ? participantAction.open(person.key, event.currentTarget) : person.onSelect?.()}>
            {contents}
          </button> : <span className="together-person" aria-label={label}>{contents}</span>}
        </span>;
      })}
    </div>
    <div className="together-roster-actions">
      <span className="together-viewer-count" aria-label={t("common.viewers") + " " + entries.length}>
        <Glyph name="users" size={18} />{entries.length}
      </span>
      {footerAction}
    </div>
  </div>;
}
