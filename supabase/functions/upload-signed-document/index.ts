// Supabase Edge Function: upload-signed-document
// Deploy: supabase functions deploy upload-signed-document
//
// Required Supabase secrets:
//   GOOGLE_SERVICE_ACCOUNT_KEY  — full JSON string of the service account key file
//   SUPABASE_URL                — set automatically by Supabase
//   SUPABASE_SERVICE_ROLE_KEY   — set automatically by Supabase
//
// Google Drive folder IDs:
//   Waiver:   1J0jh8q3A9HWXJEqi8E5NwHmPEBZ-k5n2
//   Agreement:1S_o0twk304dN_3ujKmpHnLByCt-aG_wE

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FOLDER_IDS: Record<string, string> = {
  waiver: "1J0jh8q3A9HWXJEqi8E5NwHmPEBZ-k5n2",
  training_agreement: "1S_o0twk304dN_3ujKmpHnLByCt-aG_wE",
};

// Build a signed JWT for the Google service account and exchange it for an access token
async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const headerB64 = encode(header);
  const claimB64 = encode(claim);
  const signingInput = `${headerB64}.${claimB64}`;

  // Import private key
  const pemKey = sa.private_key.replace(/\\n/g, "\n");
  const pemBody = pemKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const jwt = `${signingInput}.${sigB64}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Failed to get Google access token: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { pdfBase64, fileName, documentType, clientId, signatureId } = await req.json();

    if (!pdfBase64 || !fileName || !documentType || !clientId || !signatureId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const folderId = FOLDER_IDS[documentType as string];
    if (!folderId) {
      return new Response(JSON.stringify({ error: "Unknown document type" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const serviceAccountKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountKey) {
      return new Response(JSON.stringify({ error: "GOOGLE_SERVICE_ACCOUNT_KEY secret not set" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get Google access token
    const accessToken = await getGoogleAccessToken(serviceAccountKey);

    // Decode the base64 PDF
    const pdfBytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));

    // Upload to Google Drive using multipart upload
    const metadata = {
      name: fileName,
      mimeType: "application/pdf",
      parents: [folderId],
    };

    const boundary = "boundary_shapestudio_upload";
    const metadataPart = new TextEncoder().encode(
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`
    );
    const closingBoundary = new TextEncoder().encode(`\r\n--${boundary}--`);

    const body = new Uint8Array(metadataPart.length + pdfBytes.length + closingBoundary.length);
    body.set(metadataPart, 0);
    body.set(pdfBytes, metadataPart.length);
    body.set(closingBoundary, metadataPart.length + pdfBytes.length);

    const uploadRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Google Drive upload failed: ${errText}`);
    }

    const driveFile = await uploadRes.json();

    // Update the client_signatures record with Drive file info
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    await supabase
      .from("client_signatures")
      .update({
        google_drive_file_id: driveFile.id,
        google_drive_url: driveFile.webViewLink,
      })
      .eq("id", signatureId);

    return new Response(
      JSON.stringify({ fileId: driveFile.id, webViewLink: driveFile.webViewLink }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});
