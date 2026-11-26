/** الوضع التجريبي: صندوق الرسائل والدفع التجريبيان. في الإنتاج الحقيقي DEMO_MODE=false. */
export const isDemo = () => process.env.DEMO_MODE === "true" || (process.env.NODE_ENV !== "production" && process.env.DEMO_MODE !== "false");
