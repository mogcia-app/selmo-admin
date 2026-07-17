import type { DefaultMeetingInputMode } from "@/types/domain";

export const defaultMeetingInputModeOptions: Array<{
  value: DefaultMeetingInputMode;
  label: string;
  description: string;
}> = [
  {
    value: "audio",
    label: "音声アップロード",
    description: "Selmoに音声を保存し、AIで文字起こしします。",
  },
  {
    value: "transcript",
    label: "文字起こし貼り付け",
    description: "ZoomやGoogle Meetなどの文字起こしを貼り付けます。",
  },
];

export function readDefaultMeetingInputMode(value: unknown): DefaultMeetingInputMode {
  return value === "transcript" || value === "audio" ? value : "audio";
}

export function formatDefaultMeetingInputMode(value: DefaultMeetingInputMode) {
  return defaultMeetingInputModeOptions.find((option) => option.value === value)?.label ?? "音声アップロード";
}
