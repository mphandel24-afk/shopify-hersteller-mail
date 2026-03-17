import nodemailer from "nodemailer";

const vendorEmails = {
  Bosch: "test@example.com"
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

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

  for (const vendor in grouped) {
    const to = vendorEmails[vendor];
    if (!to) continue;

    const items = grouped[vendor]
      .map(i => `${i.title} | ${i.sku} | ${i.quantity}`)
      .join("\n");

    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject: "Neue Bestellung",
      text: items
    });
  }

  res.status(200).send("OK");
}
