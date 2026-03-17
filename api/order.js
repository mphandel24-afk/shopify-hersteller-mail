import nodemailer from "nodemailer";

const vendorEmails = {
  "Bamato": "office@werkzeugprofi.at"
};

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

    for (const vendor in grouped) {
      const to = vendorEmails[vendor];

      if (!to) {
        console.log(`Keine Mailadresse für Vendor gefunden: ${vendor}`);
        continue;
      }

      const items = grouped[vendor]
        .map(i => `${i.title} | ${i.sku} | ${i.quantity}`)
        .join("\\n");

      const info = await transporter.sendMail({
        from: process.env.MAIL_FROM,
        to,
        subject: "Neue Bestellung",
        text: items
      });

      console.log(`Mail gesendet an ${to}`, info.messageId);
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("SMTP / Versandfehler:", error);
    return res.status(500).send("Fehler beim Mailversand");
  }
}
