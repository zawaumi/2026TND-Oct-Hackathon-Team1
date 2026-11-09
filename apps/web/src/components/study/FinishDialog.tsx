"use client";

import { useEffect, useRef, useState } from "react";

/** 「授業を終える」の確認（docs/04 の 5.2）。window.confirm は使わない */
export function FinishDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => {
    if (busy) return;
    setError(null);
    onClose();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby="finish-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      className="m-auto w-[min(92vw,420px)] rounded-card bg-card p-6 text-ink shadow-[0_12px_40px_rgba(30,40,100,0.25)] backdrop:bg-[#1C1C2E]/40"
    >
      <h2 id="finish-title" className="text-[18px] font-bold">
        授業を終えますか？
      </h2>
      <p className="mt-2 text-[14.5px] leading-relaxed text-sub">
        終えると、この授業の学習レポートを作ります。会話はこのあと見られなくなります。
      </p>
      {error && (
        <p className="mt-3 rounded-xl bg-[#FDECEC] px-3 py-2 text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2.5">
        <button
          type="button"
          onClick={close}
          disabled={busy}
          className="rounded-2xl border-[1.5px] border-outline px-5 py-2.5 font-bold text-link disabled:opacity-50"
        >
          続ける
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onConfirm();
            } catch {
              setError("授業を終えられませんでした。もう一度押してください。");
              setBusy(false);
            }
          }}
          className="rounded-2xl bg-primary px-5 py-2.5 font-bold text-white disabled:opacity-60"
        >
          {busy ? "終えています…" : "授業を終える"}
        </button>
      </div>
    </dialog>
  );
}
