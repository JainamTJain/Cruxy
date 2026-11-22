/** Wave 9 E: shared calendar, polls, kudos types. */

export type TeamEventKind =
  | "practice"
  | "round"
  | "deadline"
  | "poll"
  | "other";

export type TeamEvent = {
  id: string;
  team_id: string;
  title: string;
  kind: TeamEventKind;
  starts_at: string;
  ends_at: string | null;
  place: string | null;
  online: boolean;
  body: string | null;
  practice_session_id: string | null;
  created_by: string | null;
  created_at: string;
  /** Virtual events from sessions / Dec 5 are not editable. */
  source?: "team" | "session" | "competition";
};

export type AvailabilitySlot = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  label?: string;
};

export type AvailabilityPoll = {
  id: string;
  team_id: string;
  title: string;
  slots: AvailabilitySlot[];
  created_by: string | null;
  created_at: string;
  closes_at: string | null;
  chosen_slot_id: string | null;
  resulting_event_id: string | null;
};

export type AvailabilityPollVote = {
  poll_id: string;
  person_id: string;
  slot_ids: string[];
  updated_at: string;
};

export type PeerKudos = {
  id: string;
  team_id: string;
  from_person_id: string;
  to_person_id: string;
  body: string;
  round_id: string | null;
  case_id: string | null;
  created_at: string;
};

export type WorkloadRow = {
  personId: string;
  name: string;
  leadCount: number;
  roleCount: number;
  openTaskCount: number;
  total: number;
  heavy: boolean;
  /** Suggested swap partner (lighter load) when heavy. */
  suggestSwapWith: { personId: string; name: string } | null;
};
