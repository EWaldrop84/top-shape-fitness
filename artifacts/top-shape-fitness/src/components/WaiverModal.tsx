import { useRef, useState } from "react";
import jsPDF from "jspdf";
import { supabase } from "@/lib/supabase";

const WAIVER_SECTIONS = [
  {
    title: "1. ASSUMPTION OF RISK",
    text: "I understand that participation in physical fitness activities, including personal training, involves inherent risks of injury, including but not limited to muscular strains, sprains, fractures, and in rare cases, serious injury or death. I voluntarily assume all risks associated with my participation.",
  },
  {
    title: "2. MEDICAL CLEARANCE",
    text: "I represent that I am in good physical health and have obtained appropriate medical clearance prior to beginning any exercise program. I agree to inform my trainer of any medical conditions, injuries, or physical limitations that may affect my participation.",
  },
  {
    title: "3. RELEASE OF LIABILITY",
    text: "I hereby release, waive, discharge, and covenant not to sue Top Shape of Charleston, LLC, EW Fitness LLC, Top Shape Fitness, its owners, employees, contractors, agents, and representatives from any and all liability, claims, demands, or causes of action arising out of or related to any loss, damage, injury, or death that may occur during or as a result of my participation in personal training services, whether caused by negligence or otherwise.",
  },
  {
    title: "4. INDEMNIFICATION",
    text: "I agree to indemnify and hold harmless Top Shape Fitness and its representatives from any loss, liability, damage, or cost they may incur as a result of my participation.",
  },
  {
    title: "5. PHOTO AND MEDIA RELEASE",
    text: "I grant Top Shape Fitness the right to use photographs or videos taken during training sessions for promotional purposes, unless I notify Top Shape Fitness in writing of my objection.",
  },
  {
    title: "6. GOVERNING LAW",
    text: "This agreement shall be governed by the laws of the State of South Carolina. Any disputes shall be resolved in Charleston County, South Carolina.",
  },
  {
    title: "7. ACKNOWLEDGMENT",
    text: "I have read this waiver carefully and understand its terms. I am signing this agreement voluntarily and of my own free will.",
  },
];

function todayFormatted() {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function generateWaiverPdf(clientName: string, signatureDataUrl: string, date: string): string {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;
  const cw = pageW - 2 * margin;
  let y = 20;

  function wrap(text: string, x: number, startY: number, maxW: number, lh = 4.5): number {
    const lines = doc.splitTextToSize(text, maxW);
    doc.text(lines, x, startY);
    return startY + lines.length * lh;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("LIABILITY WAIVER AND ASSUMPTION OF RISK", pageW / 2, y, { align: "center" });
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "Top Shape Fitness | 701 East Bay St., Suite 103, Charleston, SC 29403",
    pageW / 2,
    y,
    { align: "center" }
  );
  y += 5;
  doc.text(`Effective Date: ${date}`, pageW / 2, y, { align: "center" });
  y += 7;

  doc.setDrawColor(42, 37, 93);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageW - margin, y);
  y += 7;

  doc.setFontSize(9);
  y =
    wrap(
      `I, ${clientName}, in consideration of being permitted to participate in personal training services provided by Top Shape Fitness (Top Shape of Charleston, LLC / EW Fitness LLC), hereby acknowledge and agree to the following:`,
      margin,
      y,
      cw
    ) + 6;

  for (const s of WAIVER_SECTIONS) {
    if (y > 258) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(s.title, margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    y = wrap(s.text, margin, y, cw) + 6;
  }

  if (y > 242) {
    doc.addPage();
    y = 20;
  }
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.text("Client Signature:", margin, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.rect(margin, y, 82, 22);
  try {
    doc.addImage(signatureDataUrl, "PNG", margin + 1, y + 1, 80, 20);
  } catch {
    // signature image may fail if canvas was empty — skip
  }
  y += 26;
  doc.text(`Client Name: ${clientName}`, margin, y);
  y += 5;
  doc.text(`Date: ${date}`, margin, y);
  y += 10;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.text("Top Shape Fitness — 701 East Bay St., Suite 103, Charleston, SC 29403", margin, y);

  return doc.output("datauristring").split(",")[1];
}

async function uploadToGoogleDrive(payload: {
  pdfBase64: string;
  fileName: string;
  documentType: string;
  clientId: string;
  signatureId: string;
}) {
  await supabase.functions.invoke("upload-signed-document", { body: payload });
}

interface WaiverModalProps {
  clientId: string;
  clientName: string;
  onComplete: () => void;
}

export default function WaiverModal({ clientId, clientName, onComplete }: WaiverModalProps) {
  const [fullName, setFullName] = useState(clientName);
  const [agreed, setAgreed] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const date = todayFormatted();

  function getPos(e: PointerEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawing.current = true;
    lastPoint.current = getPos(e.nativeEvent, canvas);
    canvas.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing.current || !canvasRef.current || !lastPoint.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pt = getPos(e.nativeEvent, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPoint.current = pt;
    if (!hasSignature) setHasSignature(true);
  }

  function handlePointerUp() {
    isDrawing.current = false;
    lastPoint.current = null;
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  async function handleSign() {
    if (!fullName.trim() || !agreed || !hasSignature) return;
    setSaving(true);
    setError(null);

    const canvas = canvasRef.current;
    if (!canvas) {
      setSaving(false);
      return;
    }
    const signatureData = canvas.toDataURL("image/png");

    try {
      const { data: sigRow, error: sigErr } = await supabase
        .from("client_signatures")
        .insert({
          client_id: clientId,
          document_type: "waiver",
          signature_data: signatureData,
          full_name: fullName.trim(),
        })
        .select("id")
        .single();

      if (sigErr) throw sigErr;

      const pdfBase64 = generateWaiverPdf(fullName.trim(), signatureData, date);
      const lastName = fullName.trim().split(" ").pop() ?? fullName.trim();
      const firstName = fullName.trim().split(" ")[0] ?? "";
      const isoDate = new Date().toISOString().slice(0, 10);

      uploadToGoogleDrive({
        pdfBase64,
        fileName: `Waiver_${lastName}_${firstName}_${isoDate}.pdf`,
        documentType: "waiver",
        clientId,
        signatureId: sigRow.id,
      }).catch(() => {});

      onComplete();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setSaving(false);
    }
  }

  const canSign = fullName.trim().length > 0 && agreed && hasSignature && !saving;

  return (
    <div className="fixed inset-0 z-[100] bg-[#2A255D] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 bg-[#2A255D] border-b border-white/10 flex items-center gap-3">
        <img
          src="/Top_Shape_Fitness_Logo_Final_RGB.jpg"
          alt="Shape Studio"
          className="h-9 w-auto object-contain"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <div>
          <h2 className="text-white font-bold text-sm leading-tight">Liability Waiver</h2>
          <p className="text-white/50 text-xs">Read and sign to continue</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/30">
          <svg className="w-3 h-3 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
          <span className="text-amber-400 text-xs font-medium">Required to proceed</span>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-2xl mx-auto p-4 space-y-4">
          {/* Document */}
          <div className="bg-white rounded-xl shadow-sm p-6 md:p-8">
            <div className="text-center mb-5">
              <img
                src="/Top_Shape_Fitness_Logo_Final_RGB.jpg"
                alt="Shape Studio"
                className="h-14 mx-auto object-contain mb-4"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <div className="border-b-2 border-[#2A255D] mb-4" />
              <h1 className="text-base font-bold text-[#2A255D] uppercase tracking-wide">
                Liability Waiver and Assumption of Risk
              </h1>
              <p className="text-xs text-gray-500 mt-1">
                Top Shape Fitness | 701 East Bay St., Suite 103, Charleston, SC 29403
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Effective Date: {date}</p>
            </div>

            <p className="text-sm text-gray-700 leading-relaxed mb-5">
              I,{" "}
              <span className="font-semibold text-[#2A255D]">
                {fullName || "___________________"}
              </span>
              , in consideration of being permitted to participate in personal training services
              provided by Top Shape Fitness (Top Shape of Charleston, LLC / EW Fitness LLC), hereby
              acknowledge and agree to the following:
            </p>

            <div className="space-y-4">
              {WAIVER_SECTIONS.map((s) => (
                <div key={s.title}>
                  <p className="text-xs font-bold text-[#2A255D] uppercase tracking-wide mb-1">
                    {s.title}
                  </p>
                  <p className="text-sm text-gray-700 leading-relaxed">{s.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Signature form */}
          <div className="bg-white rounded-xl shadow-sm p-5 space-y-5">
            <h3 className="text-sm font-bold text-[#2A255D]">Sign the Document</h3>

            <div>
              <label className="block text-xs font-semibold text-[#2A255D] mb-1.5">
                Full Legal Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full legal name"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#06A29E]/40 focus:border-[#06A29E] transition"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[#2A255D]">
                  Signature <span className="text-red-500">*</span>
                </label>
                <button
                  onClick={clearSignature}
                  className="text-xs text-gray-400 hover:text-red-500 transition font-medium"
                >
                  Clear
                </button>
              </div>
              <div
                className={`rounded-xl border-2 overflow-hidden bg-white transition ${
                  hasSignature ? "border-[#06A29E]" : "border-gray-300"
                }`}
              >
                <canvas
                  ref={canvasRef}
                  width={620}
                  height={150}
                  className="w-full touch-none cursor-crosshair block"
                  style={{ background: "#fff" }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                />
              </div>
              {!hasSignature && (
                <p className="text-xs text-gray-400 mt-1">Draw your signature in the box above</p>
              )}
            </div>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <button
                type="button"
                onClick={() => setAgreed((a) => !a)}
                className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition ${
                  agreed
                    ? "bg-[#06A29E] border-[#06A29E]"
                    : "border-gray-300 bg-white hover:border-[#06A29E]/50"
                }`}
              >
                {agreed && (
                  <svg
                    className="w-3 h-3 text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
              <span className="text-sm text-gray-700 leading-relaxed">
                I have read, understood, and agree to the terms of this Liability Waiver and
                Assumption of Risk.
              </span>
            </label>

            <div className="flex items-center gap-2 text-sm text-gray-500">
              <svg
                className="w-4 h-4 text-gray-400 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>Date: {date}</span>
            </div>

            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <button
              onClick={handleSign}
              disabled={!canSign}
              className="w-full py-3 rounded-xl bg-[#06A29E] text-white font-semibold text-sm hover:bg-[#048e8a] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving…
                </span>
              ) : (
                "Sign Document"
              )}
            </button>

            {!canSign && !saving && (
              <p className="text-xs text-gray-400 text-center">
                {[
                  !fullName.trim() && "Enter your full name",
                  !hasSignature && "Draw your signature",
                  !agreed && "Check the agreement box",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>

          <div className="h-6" />
        </div>
      </div>
    </div>
  );
}
