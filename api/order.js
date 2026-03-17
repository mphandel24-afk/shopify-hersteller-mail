import nodemailer from "nodemailer";

const vendorEmails = {
  "Bamato": "office@werkzeugprofi24.at"
  import nodemailer from "nodemailer";
import { PDFDocument, StandardFonts } from "pdf-lib";

const vendorEmails = {
  "DEIN_EXAKTER_VENDOR": "deine-mail@deinedomain.de"
};

function formatShippingAddress(address) {
  if (!address) return "Keine Lieferadresse vorhanden";

  const lines = [
    [address.first_name, address.last_name].filter(Boolean).join(" "),
    address.company || "",
    address.address1 || "",
    address.address2 || "",
    [address.zip, address.city].filter(Boolean).join(" "),
    address.country || "",
    address.phone ? `Tel: ${address.phone}` : ""
  ].filter(Boolean);

  return lines.join("\n");
}

async function createDeliveryNotePdf({
  orderNumber,
  vendor,
  shippingAddress,
  customerEmail,
  customerPhone,
  items
}) {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  const left = 50;
  const lineHeight = 16;

  const drawLine = (text, options = {}) => {
    const { x = left, size = 11, bold = false } = options;

    page.drawText(String(text), {
      x,
      y,
      size,
      font: bold ? boldFont : font
    });
    y -= lineHeight;
  };

  const newPageIfNeeded = () => {
    if (y < 100) {
      page = pdfDoc.addPage([595, 842]);
      y = 800;
    }
  };

  drawLine("Lieferschein", { size: 18, bold: true });
  y -= 8;

  drawLine(`Bestellnummer: ${orderNumber}`);
  drawLine(`Hersteller: ${vendor}`);
  y -= 8;

  drawLine("Empfänger / Lieferadresse", { bold: true });
  shippingAddress.split("\n").forEach((line) => {
    newPageIfNeeded();
    drawLine(line);
  });

  y -= 8;
  newPageIfNeeded();
  drawLine(`E-Mail Kunde: ${customerEmail || "-"}`);
  drawLine(`Telefon Kunde: ${customerPhone || "-"}`);
  y -= 12;

  newPageIfNeeded();
  drawLine("Bestellte Artikel", { bold: true });
  y -= 4;

  items.forEach((item, index) => {
    newPageIfNeeded();
    drawLine(`${index + 1}. ${item.title || "-"}`, { bold: true });
    drawLine(`EAN/SKU: ${item.sku || item.barcode || "-"}`);
    drawLine(`Menge: ${item.quantity || 1}`);
    drawLine(`Einzelpreis: ${item.price || "-"}`);
    y -= 8;
  });

  newPageIfNeeded();
  drawLine("Bitte Ware direkt an den oben genannten Empfänger versenden.");
  drawLine("Vielen Dank.");

  return await pdfDoc.save();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const order = req.body;
    const grouped = {};

    for (const item of order.line_items || []) {
      const vendor = (item.vendor || "UNKNOWN").trim();
      if (!grouped[vendor]) grouped[vendor] = [];
      grouped[vendor].push(item);
    }

    console.log("Bestellung empfangen");
    console.log("Gefundene Vendoren:", Object.keys(grouped));

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    await transporter.verify();
    console.log("SMTP Verbindung erfolgreich");

    const orderNumber = order.name || order.order_number || "Unbekannt";
    const shippingAddress = formatShippingAddress(order.shipping_address);
    const customerEmail = order.email || "Keine E-Mail";
    const customerPhone =
      order.phone || order.shipping_address?.phone || "Keine Telefonnummer";

    for (const vendor of Object.keys(grouped)) {
      const to = vendorEmails[vendor];

      if (!to) {
        console.log(`Keine Mailadresse für Vendor gefunden: ${vendor}`);
        continue;
      }

      const items = grouped[vendor];

      const itemsText = items
        .map((item, index) => {
          return `${index + 1}. ${item.title || "-"}
EAN/SKU: ${item.sku || item.barcode || "-"}
Menge: ${item.quantity || 1}
Einzelpreis: ${item.price || "-"}`;
        })
        .join("\n\n");

      const text = `Guten Tag,

vielen Dank für die Bearbeitung dieser Bestellung.

Bestellnummer: ${orderNumber}
Hersteller: ${vendor}

Empfänger / Lieferadresse:
${shippingAddress}

E-Mail Kunde: ${customerEmail}
Telefon Kunde: ${customerPhone}

Bestellte Artikel:
${itemsText}

Bitte versenden Sie die Ware direkt an den oben genannten Empfänger.

Vielen Dank.`;

      const pdfBytes = await createDeliveryNotePdf({
        orderNumber,
        vendor,
        shippingAddress,
        customerEmail,
        customerPhone,
        items
      });

      const info = await transporter.sendMail({
        from: process.env.MAIL_FROM,
        to,
        subject: `Neue Bestellung ${orderNumber}`,
        text,
        attachments: [
          {
            filename: `Lieferschein-${orderNumber}.pdf`,
            content: Buffer.from(pdfBytes),
            contentType: "application/pdf"
          }
        ]
      });

      console.log("Mail gesendet an:", to);
      console.log("Message ID:", info.messageId);
      console.log("Response:", info.response);
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("SMTP / Versandfehler:", error);
    return res.status(500).send("Fehler beim Mailversand");
  }
}
