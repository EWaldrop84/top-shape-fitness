const TWILIO_FROM = process.env.TWILIO_FROM_NUMBER ?? "+18434102198";

function svcHdrs(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

async function logSms(
  supabaseUrl: string,
  supabaseKey: string,
  recipientUserId: string,
  phone: string,
  triggerType: string,
  messageBody: string,
  status: "sent" | "failed",
  twilioSid: string | null,
): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/rest/v1/sms_log`, {
      method: "POST",
      headers: { ...svcHdrs(supabaseKey), Prefer: "return=minimal" },
      body: JSON.stringify({
        recipient_user_id: recipientUserId,
        phone_number: phone,
        trigger_type: triggerType,
        message_body: messageBody,
        status,
        twilio_sid: twilioSid,
      }),
    });
  } catch {
    // logging must never throw
  }
}

export async function sendSMS(
  supabaseUrl: string,
  supabaseKey: string,
  recipientUserId: string,
  phone: string,
  triggerType: string,
  message: string,
): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  let status: "sent" | "failed" = "failed";
  let twilioSid: string | null = null;

  if (sid && authToken && phone) {
    try {
      const body = new URLSearchParams({ To: phone, From: TWILIO_FROM, Body: message });
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${sid}:${authToken}`).toString("base64")}`,
          },
          body,
        },
      );
      const data = (await res.json()) as { sid?: string };
      if (data.sid) { twilioSid = data.sid; status = "sent"; }
    } catch {
      status = "failed";
    }
  }

  await logSms(supabaseUrl, supabaseKey, recipientUserId, phone, triggerType, message, status, twilioSid);
}

// ── Trigger functions ─────────────────────────────────────────────────────────

export async function sendBookingConfirmation(
  supabaseUrl: string,
  supabaseKey: string,
  client: { user_id: string; first_name: string; phone: string },
  trainer: { first_name: string; last_name: string | null },
  appointment: { appointment_date: string; start_time: string; duration_minutes: number },
): Promise<void> {
  const trainerName = [trainer.first_name, trainer.last_name].filter(Boolean).join(" ");
  const msg =
    `Hi ${client.first_name}, your session with ${trainerName} is confirmed for ` +
    `${formatDate(appointment.appointment_date)} at ${formatTime(appointment.start_time)} ` +
    `(${appointment.duration_minutes} min). Reply STOP to unsubscribe. -Top Shape Fitness`;
  await sendSMS(supabaseUrl, supabaseKey, client.user_id, client.phone, "booking_confirmation", msg);
}

export async function send24HrReminder(
  supabaseUrl: string,
  supabaseKey: string,
  client: { user_id: string; first_name: string; phone: string },
  trainer: { first_name: string; last_name: string | null },
  appointment: { start_time: string; duration_minutes: number },
): Promise<void> {
  const trainerName = [trainer.first_name, trainer.last_name].filter(Boolean).join(" ");
  const msg =
    `Hi ${client.first_name}, reminder: your session tomorrow at ${formatTime(appointment.start_time)} ` +
    `(${appointment.duration_minutes} min) with ${trainerName}. See you then! -Top Shape Fitness`;
  await sendSMS(supabaseUrl, supabaseKey, client.user_id, client.phone, "reminder_24hr", msg);
}

export async function sendCancellationReceipt(
  supabaseUrl: string,
  supabaseKey: string,
  client: { user_id: string; first_name: string; phone: string },
  appointment: { appointment_date: string; start_time: string },
  within24hr: boolean,
): Promise<void> {
  const dateStr = formatDate(appointment.appointment_date);
  const timeStr = formatTime(appointment.start_time);
  const msg = within24hr
    ? `Hi ${client.first_name}, your session on ${dateStr} at ${timeStr} has been cancelled. ` +
      `Per our 24-hour policy, this session cannot be returned. Contact us with questions. -Top Shape Fitness`
    : `Hi ${client.first_name}, your session on ${dateStr} at ${timeStr} has been cancelled. ` +
      `Your session has been returned to your package. -Top Shape Fitness`;
  const triggerType = within24hr ? "forfeiture" : "cancellation";
  await sendSMS(supabaseUrl, supabaseKey, client.user_id, client.phone, triggerType, msg);
}

export async function sendTrainerCancellationAlert(
  supabaseUrl: string,
  supabaseKey: string,
  trainer: { user_id: string; phone: string },
  clientName: string,
  appointment: { appointment_date: string; start_time: string },
): Promise<void> {
  const msg =
    `Top Shape Alert: ${clientName} cancelled their ${formatTime(appointment.start_time)} ` +
    `session on ${formatDate(appointment.appointment_date)}. -Top Shape Fitness`;
  await sendSMS(supabaseUrl, supabaseKey, trainer.user_id, trainer.phone, "cancellation", msg);
}

export async function sendLowPackageAlert(
  supabaseUrl: string,
  supabaseKey: string,
  client: { user_id: string; first_name: string; phone: string },
  sessionsRemaining: number,
): Promise<void> {
  const msg =
    `Hi ${client.first_name}, you have ${sessionsRemaining} session${sessionsRemaining === 1 ? "" : "s"} remaining in your package. ` +
    `Contact us to renew soon! -Top Shape Fitness`;
  await sendSMS(supabaseUrl, supabaseKey, client.user_id, client.phone, "low_package", msg);
}

export async function sendRenewalReminder(
  supabaseUrl: string,
  supabaseKey: string,
  client: { user_id: string; first_name: string; phone: string },
): Promise<void> {
  const msg =
    `Hi ${client.first_name}, this is your last session! ` +
    `Reach out to renew your package and keep your momentum going. -Top Shape Fitness`;
  await sendSMS(supabaseUrl, supabaseKey, client.user_id, client.phone, "renewal", msg);
}

export async function sendExpirationWarning(
  supabaseUrl: string,
  supabaseKey: string,
  client: { user_id: string; first_name: string; phone: string },
  expirationDate: string,
): Promise<void> {
  const msg =
    `Hi ${client.first_name}, your session package expires on ${formatDate(expirationDate)}. ` +
    `Contact us to extend or renew before it expires. -Top Shape Fitness`;
  await sendSMS(supabaseUrl, supabaseKey, client.user_id, client.phone, "expiration_warning", msg);
}

export async function sendWaitlistNotification(
  supabaseUrl: string,
  supabaseKey: string,
  client: { user_id: string; first_name: string; phone: string },
  slot: { appointment_date: string; start_time: string },
): Promise<void> {
  const msg =
    `Hi ${client.first_name}, a slot has opened up! ` +
    `${formatDate(slot.appointment_date)} at ${formatTime(slot.start_time)} is now available. ` +
    `Book now before it fills up. -Top Shape Fitness`;
  await sendSMS(supabaseUrl, supabaseKey, client.user_id, client.phone, "waitlist_opened", msg);
}
