/** خطأ منتج برسالة عربية تُعرض للمستخدم */
export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}
export const notFound = (what = "العنصر") => new AppError("not_found", `${what} غير موجود`, 404);
export const fail = (code: string, msg: string) => new AppError(code, msg);
