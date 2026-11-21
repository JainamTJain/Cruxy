type Props = {
  names: string[];
  /** Own-device note when the viewer themselves is text only. */
  selfTextOnly?: boolean;
};

/**
 * F-386: every practice / judging screen shows when a text-only member is here.
 * Plain words, no middle dots or em dashes.
 */
export function TextOnlyBanner({ names, selfTextOnly }: Props) {
  if (!names.length && !selfTextOnly) return null;
  const list =
    names.length === 0
      ? null
      : names.length === 1
        ? names[0]
        : names.length === 2
          ? `${names[0]} and ${names[1]}`
          : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;

  return (
    <div
      role="status"
      className="rounded-[14px] border border-[#E3E5E9] bg-[#FFF7DB] px-4 py-3 text-sm text-ink"
    >
      {selfTextOnly ? (
        <p>
          You chose text only. This device will not record. You can still join
          and type.
        </p>
      ) : null}
      {list ? (
        <p className={selfTextOnly ? "mt-1" : undefined}>
          {list} chose text only. Do not use a shared room microphone while they
          are here. Own-device recording only.
        </p>
      ) : null}
    </div>
  );
}
