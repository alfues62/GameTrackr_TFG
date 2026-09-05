/* eslint-disable @next/next/no-img-element */
"use client";

import { useRef, useState } from "react";
import { CloseIcon, PlusIcon } from "@/components/icons";
import api from "@/lib/axios";

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post<{ url: string }>("/api/uploads/", form);
  return res.data.url;
}

interface Props {
  value: string | null;
  onChange: (url: string | null) => void;
  /** Forma del área: círculo (avatar) o panorámica 16:9 (portadas, posts). */
  shape?: "circle" | "wide";
  label?: string;
  className?: string;
}

export function ImageDropzone({ value, onChange, shape = "wide", label, className = "" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");

  const isCircle = shape === "circle";
  const frame = isCircle ? "h-24 w-24 rounded-full" : "aspect-[16/9] w-full rounded-xl";

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      onChange(await uploadImage(file));
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? "No se pudo subir la imagen.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={className}>
      {label && <p className="mb-1.5 text-xs uppercase tracking-wider text-neutral-400">{label}</p>}

      <div className={isCircle ? "flex items-center gap-4" : ""}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
          className={`relative grid ${frame} shrink-0 place-items-center overflow-hidden border-2 transition-colors ${
            value ? "border-solid border-neutral-200" : "border-dashed"
          } ${dragging ? "border-accent bg-accent/5" : "border-neutral-300 hover:border-accent"}`}
        >
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1 px-2 text-center text-neutral-400">
              <PlusIcon className="h-5 w-5" />
              <span className="text-[11px] leading-tight">{uploading ? "Subiendo…" : "Arrastra o haz clic"}</span>
            </span>
          )}
          {uploading && value && (
            <span className="absolute inset-0 grid place-items-center bg-black/40 text-xs font-medium text-white">Subiendo…</span>
          )}
        </button>

        <div className={isCircle ? "" : "mt-2 flex items-center gap-3"}>
          {value && (
            <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-pink-600">
              <CloseIcon className="h-3.5 w-3.5" /> Quitar
            </button>
          )}
          <button type="button" onClick={() => setShowUrl((v) => !v)} className={`text-xs font-medium text-neutral-400 hover:text-accent ${isCircle && value ? "mt-1 block" : ""}`}>
            {showUrl ? "Ocultar URL" : "o usar una URL"}
          </button>
        </div>
      </div>

      {showUrl && (
        <div className="mt-2 flex gap-2">
          <input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://… (URL de la imagen)"
            className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <button
            type="button"
            onClick={() => { const u = urlDraft.trim(); if (u) { onChange(u); setUrlDraft(""); setShowUrl(false); } }}
            className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            Usar
          </button>
        </div>
      )}

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
      />
    </div>
  );
}
