import { useRef, useState } from "react";
import jsPDF from "jspdf";
import { supabase } from "@/lib/supabase";

const SESSION_TYPES = ["½ Hour", "Hourly", "Individual", "45 min", "Group"] as const;
type SessionType = (typeof SESSION_TYPES)[number];

const CANCELLATION_TEXT_A = `You may cancel this Membership Agreement and any related Retail Installment Sale Contract by sending notice of your wish to cancel to the seller before midnight of the third business day after you sign the Membership Agreement. 'Business day' means Monday through Friday excluding state holidays and federal holidays. This notice must be sent certified mail to the following:

Top Shape Fitness - 701 East Bay St., Ste. 103 Charleston, SC 29403

Within thirty days of receipt of this notice, the seller shall return any payments made and any note or other evidence of indebtedness. If you use the seller's facilities or services, the seller may charge you a reasonable fee based on days of actual use.`;

const CANCELLATION_TEXT_B = `In addition, you or your estate may also cancel this Membership Agreement and any related Retail Installment Contract at any time by written notice to the seller at the above address if the following circumstances occur.
  (1) the customer's death;
  (2) substantial physical disability certified by a physician, which makes it permanently impossible for the customer to use the seller's services;
  (3) the customer's permanent relocation over fifty (50) miles distance from an outlet operated by the seller, if the seller is unable to arrange for the customer's use of another facility with equivalent major facilities and services. The seller may require presentation of information to substantiate that one of these circumstances has occurred. If the Membership Agreement and any Retail Installment Sale Contract are cancelled because of disability, death or permanent change of residence, the seller shall return any note or other evidence of indebtedness and unearned prepayments as follows: for each month that the Membership Agreement was in effect, the seller is entitled to the rate a month or a treatment which it would have been charged if the Membership Agreement has initially been one for the number of months or the number of treatments for which the Membership Agreement was actually in effect. The rate is to be determined from a fee schedule in effect on the date of the Membership Agreement.`;

const CANCELLATION_TEXT_C = `The right of cancellation shall affect only the financial obligations under the Membership Agreement and any Retail Installment Sale Contract and customer's right to use seller's physical fitness services.`;

function todayFormatted() {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function fmtMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function generateAgreementPdf(params: {
  clientName: string;
  address: string;
  cityStateZip: string;
  homePhone: string;
  workPhone: string;
  emergencyContact: string;
  sessionsPurchased: number;
  sessionType: string;
  amountPaidCents: number;
  beginningDate: string;
  endingDate: string;
  signatureDataUrl: string;
  date: string;
}): string {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const cw = pageW - 2 * margin;
  let y = 16;

  function checkPage(needed = 20) {
    if (y + needed > 275) {
      doc.addPage();
      y = 16;
    }
  }

  function wrap(text: string, x: number, startY: number, maxW: number, lh = 4.2): number {
    const lines = doc.splitTextToSize(text, maxW);
    doc.text(lines, x, startY);
    return startY + lines.length * lh;
  }

  function sectionBar(title: string) {
    checkPage(12);
    doc.setFillColor(200, 200, 200);
    doc.rect(margin, y - 4.5, cw, 6.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(30, 30, 30);
    doc.text(title, margin + 2, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
  }

  function fieldRow(label: string, value: string) {
    checkPage(7);
    const lw = 58;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(`${label}:`, margin + 2, y);
    doc.setFont("helvetica", "normal");
    doc.text(value || "", margin + lw, y);
    y += 5.5;
  }

  // Left column title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const leftLines = [
    "SOUTH CAROLINA",
    "PHYSICAL FITNESS",
    "PERSONAL TRAINING",
    "MEMBERSHIP AGREEMENT",
  ];
  for (const line of leftLines) {
    doc.text(line, margin, y);
    y += 4.5;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("(Pre-paid Only)", margin, y);

  // Right column
  const rightX = pageW - margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const rightLines = [
    "EW FITNESS LLC",
    "701 EAST BAY ST.",
    "STE 103",
    "CHARLESTON, SC 29403",
    "843-990-9123",
  ];
  let ry = 16;
  for (const line of rightLines) {
    doc.text(line, rightX, ry, { align: "right" });
    ry += 4.5;
  }

  y = 42;
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 7;

  // Section 1
  sectionBar("SECTION 1 — CLIENT INFORMATION");
  fieldRow("Name", params.clientName);
  fieldRow("Address", params.address);
  fieldRow("City, State Zip", params.cityStateZip);
  fieldRow("Home Telephone No.", params.homePhone);
  fieldRow("Client's Work Telephone No.", params.workPhone);
  fieldRow("Emergency Contact (Optional)", params.emergencyContact);
  y += 2;

  // Section 2
  sectionBar("SECTION 2 — SESSION/PACKAGE INFORMATION");
  fieldRow("Number Purchased", String(params.sessionsPurchased));
  y += 2;

  // Section 3
  sectionBar("SECTION 3 — TYPE");
  checkPage(20);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.text("(Customize to Individual Personal Trainer's Needs)", margin + 2, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const types = SESSION_TYPES as readonly string[];
  let tx = margin + 2;
  for (const t of types) {
    const checked = params.sessionType === t;
    doc.setLineWidth(0.3);
    doc.rect(tx, y - 3.5, 3.5, 3.5);
    if (checked) {
      doc.setFont("helvetica", "bold");
      doc.text("X", tx + 0.4, y - 0.3);
      doc.setFont("helvetica", "normal");
    }
    doc.text(t, tx + 5, y);
    tx += 32;
  }
  y += 7;
  fieldRow("Amount Paid", fmtMoney(params.amountPaidCents));
  fieldRow("Beginning Date", fmtDate(params.beginningDate));
  fieldRow("Ending Date", fmtDate(params.endingDate));
  y += 2;

  // Section 4
  sectionBar("SECTION 4 — CUSTOMER'S RIGHT TO CANCELLATION");
  doc.setFontSize(8);
  checkPage(15);
  doc.setFont("helvetica", "bold");
  doc.text("(a)", margin + 2, y);
  doc.setFont("helvetica", "normal");
  y = wrap(CANCELLATION_TEXT_A, margin + 10, y, cw - 10) + 4;

  checkPage(15);
  doc.setFont("helvetica", "bold");
  doc.text("(b)", margin + 2, y);
  doc.setFont("helvetica", "normal");
  y = wrap(CANCELLATION_TEXT_B, margin + 10, y, cw - 10) + 4;

  checkPage(10);
  doc.setFont("helvetica", "bold");
  doc.text("(c)", margin + 2, y);
  doc.setFont("helvetica", "normal");
  y = wrap(CANCELLATION_TEXT_C, margin + 10, y, cw - 10) + 6;

  checkPage(10);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.text(`"I have been provided a copy of this personal training contract."`, margin + 2, y);
  y += 10;

  // Signature
  checkPage(40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("Client's Signature:", margin, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.rect(margin, y, 82, 22);
  try {
    doc.addImage(params.signatureDataUrl, "PNG", margin + 1, y + 1, 80, 20);
  } catch {}
  y += 26;
  doc.text(`Date: ${params.date}`, margin, y);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.text("Seller's Signature:", margin, y);
  doc.setFont("helvetica", "normal");
  y += 5;
  doc.text("Eric Waldrop, Owner — Top Shape Fitness", margin, y);

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

export interface TrainingAgreementModalProps {
  clientId: string;
  clientName: string;
  clientPhone?: string;
  clientPackageId: string;
  packageName: string;
  sessionsTotal: number;
  sessionType: SessionType;
  amountPaidCents: number;
  beginningDate: string;
  endingDate: string;
  onComplete: () => void;
  onDismiss?: () => void;
}

export default function TrainingAgreementModal({
  clientId,
  clientName,
  clientPhone = "",
  clientPackageId,
  packageName: _packageName,
  sessionsTotal,
  sessionType,
  amountPaidCents,
  beginningDate,
  endingDate,
  onComplete,
  onDismiss,
}: TrainingAgreementModalProps) {
  const [form, setForm] = useState({
    address: "",
    cityStateZip: "",
    homePhone: clientPhone,
    workPhone: "",
    emergencyContact: "",
  });
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
    if (!hasSignature) return;
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
          document_type: "training_agreement",
          signature_data: signatureData,
          full_name: clientName,
          client_package_id: clientPackageId,
          session_type: sessionType,
          amount_paid: amountPaidCents,
          beginning_date: beginningDate || null,
          ending_date: endingDate || null,
          sessions_purchased: sessionsTotal,
          address: form.address || null,
          city_state_zip: form.cityStateZip || null,
          home_phone: form.homePhone || null,
          work_phone: form.workPhone || null,
          emergency_contact: form.emergencyContact || null,
        })
        .select("id")
        .single();

      if (sigErr) throw sigErr;

      const pdfBase64 = generateAgreementPdf({
        clientName,
        address: form.address,
        cityStateZip: form.cityStateZip,
        homePhone: form.homePhone,
        workPhone: form.workPhone,
        emergencyContact: form.emergencyContact,
        sessionsPurchased: sessionsTotal,
        sessionType,
        amountPaidCents,
        beginningDate,
        endingDate,
        signatureDataUrl: signatureData,
        date,
      });

      const nameParts = clientName.trim().split(" ");
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : clientName;
      const firstName = nameParts[0] ?? "";
      const isoDate = new Date().toISOString().slice(0, 10);

      uploadToGoogleDrive({
        pdfBase64,
        fileName: `Agreement_${lastName}_${firstName}_${isoDate}.pdf`,
        documentType: "training_agreement",
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

  function setField(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const SectionBar = ({ title }: { title: string }) => (
    <div className="bg-gray-200 px-3 py-1.5 -mx-5 md:-mx-6 mt-5 mb-3">
      <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">{title}</p>
    </div>
  );

  const ReadOnlyField = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-start gap-2 py-1.5 border-b border-gray-100">
      <span className="text-xs text-gray-500 w-40 flex-shrink-0 pt-0.5">{label}:</span>
      <span className="text-sm font-medium text-[#2A255D]">{value || "—"}</span>
    </div>
  );

  const EditableField = ({
    label,
    fieldKey,
    placeholder,
  }: {
    label: string;
    fieldKey: keyof typeof form;
    placeholder?: string;
  }) => (
    <div className="flex items-center gap-2 py-1 border-b border-gray-100">
      <span className="text-xs text-gray-500 w-40 flex-shrink-0">{label}:</span>
      <input
        type="text"
        value={form[fieldKey]}
        onChange={(e) => setField(fieldKey, e.target.value)}
        placeholder={placeholder ?? ""}
        className="flex-1 text-sm text-gray-900 bg-transparent border-0 outline-none placeholder-gray-300 min-w-0"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
      <div className="relative bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[95dvh] sm:max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-3 border-b border-gray-100 flex items-center gap-3 bg-white">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-[#2A255D] truncate">
              Personal Training Agreement
            </h2>
            <p className="text-xs text-gray-400 truncate">{clientName}</p>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition flex-shrink-0"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Scrollable document */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="bg-white mx-3 my-3 rounded-xl shadow-sm p-5 md:p-6">
            {/* Document header */}
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="space-y-0.5">
                <img
                  src="/Top_Shape_Fitness_Logo_Final_RGB.jpg"
                  alt="Shape Studio"
                  className="h-12 object-contain mb-2"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <p className="text-[10px] font-bold text-[#2A255D] leading-tight uppercase tracking-wide">
                  South Carolina Physical Fitness
                </p>
                <p className="text-[10px] font-bold text-[#2A255D] leading-tight uppercase tracking-wide">
                  Personal Training Membership Agreement
                </p>
                <p className="text-[10px] text-gray-500">(Pre-paid Only)</p>
              </div>
              <div className="text-right text-[10px] text-gray-600 leading-relaxed flex-shrink-0">
                <p className="font-bold">EW FITNESS LLC</p>
                <p>701 EAST BAY ST.</p>
                <p>STE 103</p>
                <p>CHARLESTON, SC 29403</p>
                <p>843-990-9123</p>
              </div>
            </div>
            <div className="border-b-2 border-[#2A255D] mb-4" />

            {/* Section 1 — Client Information */}
            <SectionBar title="Section 1 — Client Information" />
            <div className="space-y-0.5">
              <ReadOnlyField label="Name" value={clientName} />
              <EditableField label="Address" fieldKey="address" placeholder="Street address" />
              <EditableField
                label="City, State Zip"
                fieldKey="cityStateZip"
                placeholder="City, State ZIP"
              />
              <EditableField
                label="Home Telephone No."
                fieldKey="homePhone"
                placeholder="(555) 000-0000"
              />
              <EditableField
                label="Client's Work Tel. No."
                fieldKey="workPhone"
                placeholder="(555) 000-0000"
              />
              <EditableField
                label="Emergency Contact"
                fieldKey="emergencyContact"
                placeholder="Name and phone (optional)"
              />
            </div>

            {/* Section 2 — Session/Package Information */}
            <SectionBar title="Section 2 — Session / Package Information" />
            <ReadOnlyField label="Number Purchased" value={String(sessionsTotal)} />

            {/* Section 3 — Type */}
            <SectionBar title="Section 3 — Type" />
            <p className="text-[10px] text-gray-400 italic mb-2">
              (Customize to Individual Personal Trainer's Needs)
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 mb-3">
              {SESSION_TYPES.map((t) => (
                <div key={t} className="flex items-center gap-1.5">
                  <div
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      sessionType === t
                        ? "border-[#2A255D] bg-[#2A255D]"
                        : "border-gray-300 bg-white"
                    }`}
                  >
                    {sessionType === t && (
                      <svg
                        className="w-2.5 h-2.5 text-white"
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
                  </div>
                  <span className="text-xs text-gray-700">{t}</span>
                </div>
              ))}
            </div>
            <div className="space-y-0.5">
              <ReadOnlyField label="Amount Paid" value={fmtMoney(amountPaidCents)} />
              <ReadOnlyField
                label="Beginning Date"
                value={beginningDate ? fmtDate(beginningDate) : ""}
              />
              <ReadOnlyField label="Ending Date" value={endingDate ? fmtDate(endingDate) : ""} />
            </div>

            {/* Section 4 — Cancellation */}
            <SectionBar title="Section 4 — Customer's Right to Cancellation" />
            <div className="space-y-3 text-xs text-gray-700 leading-relaxed">
              <div className="flex gap-2">
                <span className="font-bold flex-shrink-0">(a)</span>
                <p>{CANCELLATION_TEXT_A}</p>
              </div>
              <div className="flex gap-2">
                <span className="font-bold flex-shrink-0">(b)</span>
                <p style={{ whiteSpace: "pre-line" }}>{CANCELLATION_TEXT_B}</p>
              </div>
              <div className="flex gap-2">
                <span className="font-bold flex-shrink-0">(c)</span>
                <p>{CANCELLATION_TEXT_C}</p>
              </div>
            </div>

            <p className="text-xs text-gray-700 italic mt-4 pt-3 border-t border-gray-100">
              "I have been provided a copy of this personal training contract."
            </p>

            {/* Signature section */}
            <div className="mt-6 pt-4 border-t border-gray-200 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-[#2A255D]">
                    Client's Signature <span className="text-red-500">*</span>
                  </label>
                  <button
                    onClick={clearSignature}
                    className="text-xs text-gray-400 hover:text-red-500 transition"
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
                    height={130}
                    className="w-full touch-none cursor-crosshair block"
                    style={{ background: "#fff" }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                  />
                </div>
                {!hasSignature && (
                  <p className="text-xs text-gray-400 mt-1">Draw your signature above</p>
                )}
              </div>

              <div className="flex items-center gap-6 text-xs text-gray-600">
                <span>Date: <strong>{date}</strong></span>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs text-gray-500 mb-0.5">Authorized by Top Shape Fitness:</p>
                <p className="text-sm font-semibold text-[#2A255D]">Eric Waldrop, Owner</p>
              </div>

              {error && (
                <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <button
                onClick={handleSign}
                disabled={!hasSignature || saving}
                className="w-full py-3 rounded-xl bg-[#06A29E] text-white font-semibold text-sm hover:bg-[#048e8a] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Saving…
                  </span>
                ) : (
                  "Sign Agreement"
                )}
              </button>
              {!hasSignature && !saving && (
                <p className="text-xs text-gray-400 text-center">
                  Draw your signature to enable signing
                </p>
              )}
            </div>
          </div>
          <div className="h-4" />
        </div>
      </div>
    </div>
  );
}
