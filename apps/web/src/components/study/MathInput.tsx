"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { MathfieldElement } from "mathlive";

export type MathInputHandle = {
  focus: () => void;
  /** カーソルの位置に LaTeX を入れる */
  insert: (latex: string) => void;
  backspace: () => void;
  clear: () => void;
  setValue: (latex: string) => void;
};

type Props = {
  /** 読み上げ用のラベル（画面には出ない）。スクリーンリーダーが入力欄の名前として読む */
  ariaLabel: string;
  /** 補足の説明の id（例：入力した式の読み上げ）。入力欄に結び付ける */
  describedBy?: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (latex: string) => void;
  /** Enter が押された */
  onSubmit: () => void;
  /** 読み込みの結果（失敗したら、画面は文字で入力する方法に切り替える） */
  onStatus?: (status: "ready" | "failed") => void;
};

/**
 * 数式の入力欄（MathLive）。docs/04 の 5.4。
 * MathLive はブラウザだけで動くので、画面に出たあとで読み込む（静的出力のため）。
 * 入力欄の値は LaTeX の文字列として取り出すだけで、画面に描き直したり、HTML にしたりしない。
 * MathLive の画面のキーボードは自動では出さない（会話が隠れるため）。記号のボタンは画面側で用意する。
 */
export const MathInput = forwardRef<MathInputHandle, Props>(function MathInput(
  { ariaLabel, describedBy, disabled = false, placeholder, onChange, onSubmit, onStatus },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<MathfieldElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  // 最新のコールバックを、入力欄のイベントから呼べるようにしておく
  const cb = useRef({ onChange, onSubmit, onStatus });
  useEffect(() => {
    cb.current = { onChange, onSubmit, onStatus };
  }, [onChange, onSubmit, onStatus]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => fieldRef.current?.focus(),
      insert: (latex) => {
        const f = fieldRef.current;
        if (!f) return;
        f.insert(latex, { format: "latex", focus: true });
        cb.current.onChange(f.value);
      },
      backspace: () => {
        const f = fieldRef.current;
        if (!f) return;
        f.executeCommand("deleteBackward");
        f.focus();
        cb.current.onChange(f.value);
      },
      clear: () => {
        const f = fieldRef.current;
        if (!f) return;
        f.value = "";
        cb.current.onChange("");
      },
      setValue: (latex) => {
        const f = fieldRef.current;
        if (!f) return;
        f.value = latex;
        cb.current.onChange(f.value);
      },
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let field: MathfieldElement | null = null;
    const onInput = () => cb.current.onChange(field?.value ?? "");
    const onKeyDown = (e: KeyboardEvent) => {
      // 変換中の Enter は送らない
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        cb.current.onSubmit();
      }
    };

    (async () => {
      try {
        const { MathfieldElement } = await import("mathlive");
        if (cancelled || !hostRef.current) return;
        // フォントは public/mathlive/fonts に置く（scripts/copy-mathlive-assets.mjs が、dev・build の前にコピーする）
        MathfieldElement.fontsDirectory = "/mathlive/fonts";
        MathfieldElement.soundsDirectory = null; // 入力のたびに音を出さない
        MathfieldElement.locale = "ja";

        const mf = new MathfieldElement();
        mf.className = "block w-full bg-transparent text-[24px] outline-none lg:text-[28px]";
        // 設定の一部は、画面に取り付けたあとでないとできない（先に設定するとエラーになる）
        hostRef.current.appendChild(mf);
        mf.mathVirtualKeyboardPolicy = "manual";
        mf.smartMode = false;
        mf.popoverPolicy = "off";
        mf.menuItems = [];
        mf.defaultMode = "math";
        if (placeholder) mf.placeholder = placeholder;
        mf.disabled = disabled;
        mf.setAttribute("aria-label", ariaLabel);
        if (describedBy) mf.setAttribute("aria-describedby", describedBy);
        mf.addEventListener("input", onInput);
        mf.addEventListener("keydown", onKeyDown, true);
        field = mf;
        fieldRef.current = mf;
        setStatus("ready");
        cb.current.onStatus?.("ready");
      } catch (e) {
        console.warn("数式の入力欄（MathLive）を読み込めませんでした", e);
        if (cancelled) return;
        setStatus("failed");
        cb.current.onStatus?.("failed");
      }
    })();

    return () => {
      cancelled = true;
      if (field) {
        field.removeEventListener("input", onInput);
        field.removeEventListener("keydown", onKeyDown, true);
        field.remove();
      }
      fieldRef.current = null;
    };
    // 入力欄は一度だけ作る。disabled などの変化は、下の effect で反映する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (fieldRef.current) fieldRef.current.disabled = disabled;
  }, [disabled, status]);

  // 補足の説明（入力した式の読み上げ、エラー）の結び付けは、変わるたびに更新する
  useEffect(() => {
    const f = fieldRef.current;
    if (!f) return;
    if (describedBy) f.setAttribute("aria-describedby", describedBy);
    else f.removeAttribute("aria-describedby");
  }, [describedBy, status]);

  return (
    <div className="relative min-h-[3.25rem] w-full lg:min-h-16">
      <div ref={hostRef} />
      {status === "loading" && (
        <p className="absolute inset-0 flex items-center text-[14px] text-sub" role="status">
          数式の入力欄を準備しています…
        </p>
      )}
      {status === "failed" && (
        <p className="absolute inset-0 flex items-center text-[14px] text-danger" role="alert">
          数式の入力欄を読み込めませんでした。
        </p>
      )}
    </div>
  );
});
