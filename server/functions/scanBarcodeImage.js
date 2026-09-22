import { createClientFromRequest } from '../shared/createClient.js';
import { str } from '../shared/utils.js';

// Scan barcode from an uploaded image — graceful fallback for browsers without
// the native BarcodeDetector API (iOS Safari, Firefox). Uses InvokeLLM with
// vision to read the Code 128 barcode value from a captured camera frame.
// Returns the raw barcode value; the frontend resolves it to an InventoryItem.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const imageUrl = str(body.image_url);
    if (!imageUrl) return Response.json({ error: 'Image URL required' }, { status: 400 });

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Look at this image of a jewellery barcode label. Read the barcode value — the short alphanumeric text printed below the barcode bars (typically 4-5 characters, uppercase letters and digits, e.g. A7K2 or G482X). Return ONLY the barcode value as a JSON object with a "barcode" field. If you cannot read it clearly or the image is unclear, return {"barcode": ""}.`,
      file_urls: [imageUrl],
      response_json_schema: {
        type: "object",
        properties: {
          barcode: { type: "string" }
        },
        required: ["barcode"]
      }
    });

    const barcode = str(result?.barcode || "").trim();
    return Response.json({ success: true, barcode });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}