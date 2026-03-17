import nodemailer from "nodemailer";

const vendorEmails = {
  "Bamato": "office@werkzeugprofi24.at"
};

function formatShippingAddress(address) {
  if (!address) return "Keine Lieferadresse vorhanden";

  const name = [address.first_name, address.last_name].filter(Boolean).join(" ");
  const street = [address.address1, address.address2].filter(Boolean).join(" ");
  const cityLine = [address.zip, address.city].filter(Boolean).join(" ");
  const country = address.country || "";

  return [name, street, cityLine, country].filter(Boolean).join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const order = req.body;
    const grouped = {};

    for (const item of order.line_items || []) {
      const vendor = item.vendor || "UNKNOWN";
      if (!grouped[vendor]) grouped[vendor] = [];
      grouped[vendor].push(item);
    }

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
    console.log("Gefundene Vendoren:", Object.keys(grouped));

    const orderNumber = order.name || order.order_number || "Unbekannt";
    const shippingAddress = formatShippingAddress(order.shipping_address);
    const customerEmail = order.email || "Keine E-Mail";
    const customerPhone = order.phone || order.shipping_address?.phone || "Keine Telefonnummer";

    for (const vendor in grouped) {
      const to = vendorEmails[vendor];

      if (!to) {
        console.log(`Keine Mailadresse für Vendor gefunden: ${vendor}`);
        continue;
      }

      const itemsText = grouped[vendor]
        .map((item, index) => {
          return `${index + 1}. ${item.title}
EAN/SKU: ${item.sku || item.barcode || "-"}
Menge: ${item.quantity}
Einzelpreis: ${item.price || "-"}`;
        })
        .join("\n\n");

      const text = `Guten Tag,

wir haben eine neue Bestellung erhalten und bitten um Bearbeitung.

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

      const info = await transporter.sendMail({
        from: process.env.MAIL_FROM,
        to,
        subject: `Neue Bestellung ${orderNumber}`,
        text
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
