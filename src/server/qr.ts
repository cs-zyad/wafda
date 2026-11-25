import QRCode from "qrcode";
/** رمز QR في الخادم (SVG). المحتوى رابط التذكرة فقط: رمز عشوائي 160 بت بلا بيانات شخصية. */
export const qrSvg = (text: string) => QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#28182C", light: "#FFFFFF" } });
