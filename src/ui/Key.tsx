import { token } from "@/server/crypto";
/** مفتاح منع التكرار: يُولّد في الخادم لكل عرض، ويتجدد بعد كل إجراء ناجح (لأن الصفحة يُعاد عرضها) */
export const Key = () => <input type="hidden" name="key" value={token(18)} />;
