import { db, ref, newRef, tx, getDoc } from "../db";
import { AppError, notFound } from "../errors";
import { clamp } from "@/shared/text";
import type { LayoutKey, Template } from "../types";
import { audit } from "./settings";

/** التخطيطات الخمسة مبنية في الكود؛ الأدمن يتحكم بالاسم والتصنيف والألوان والظهور والترتيب */
export const LAYOUTS: Record<LayoutKey, { label: string; category: string; colors: string[] }> = {
  plum_frame: { label: "إطار برقوقي", category: "عام", colors: ["#28182C", "#FBF7EF", "#DDF480", "#3A2540", "#D9CCDF"] },
  ivory_classic: { label: "عاجي كلاسيكي", category: "مناسبات", colors: ["#FBF7EF", "#28182C", "#B08D57", "#F1EADC", "#65586B"] },
  lilac_soft: { label: "ليلكي ناعم", category: "اجتماعي", colors: ["#E8DEED", "#28182C", "#DDF480", "#FFFFFF", "#65586B"] },
  corporate: { label: "رسمي للشركات", category: "شركات", colors: ["#FFFFFF", "#1F2A44", "#DDF480", "#EEF1F6", "#5B6475"] },
  workshop: { label: "ورش وتدريب", category: "تدريب", colors: ["#DDF480", "#28182C", "#28182C", "#FFFFFF", "#4A3F4F"] },
};
export const COLOR_ROLES = ["الخلفية", "النص الرئيسي", "اللون المميز", "الأسطح", "النص الثانوي"];

export async function seedTemplates() {
  await Promise.all(
    (Object.keys(LAYOUTS) as LayoutKey[]).map((k, i) =>
      tx(async (t) => {
        const r = ref("templates", `tpl_${k}`);
        if ((await t.get(r)).exists) return;
        t.set(r, { id: r.id, layout: k, name: LAYOUTS[k].label, category: LAYOUTS[k].category, colors: LAYOUTS[k].colors, visible: true, order: i + 1, ownerId: null, createdAt: Date.now() } satisfies Template);
      }),
    ),
  );
}

export const allTemplates = async () => (await db().collection("templates").get()).docs.map((d) => d.data() as Template).sort((a, b) => a.order - b.order);
export const templatesFor = async (ownerId: string) => (await allTemplates()).filter((t) => (t.ownerId ? t.ownerId === ownerId : t.visible));
export async function templateOf(id: string | null) {
  const t = id ? await getDoc<Template>("templates", id) : null;
  return t ?? { id: "", layout: "plum_frame" as LayoutKey, name: LAYOUTS.plum_frame.label, category: "", colors: LAYOUTS.plum_frame.colors, visible: true, order: 0, ownerId: null, createdAt: 0 };
}

export interface TemplateInput {
  layout: string;
  name: string;
  category: string;
  colors: string[];
  visible: boolean;
  order: number;
}
function check(i: TemplateInput) {
  if (!(i.layout in LAYOUTS)) throw new AppError("validation", "تخطيط غير معروف");
  const name = clamp(i.name, 80);
  if (!name) throw new AppError("validation", "اسم القالب مطلوب");
  if (i.colors.length !== 5 || !i.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c))) throw new AppError("validation", "الألوان الخمسة مطلوبة بصيغة #RRGGBB");
  return { layout: i.layout as LayoutKey, name, category: clamp(i.category, 60) || "عام", colors: i.colors.map((c) => c.toUpperCase()), visible: !!i.visible, order: Number.isFinite(i.order) ? Math.round(i.order) : 99 };
}

export async function saveTemplate(actorId: string, id: string | null, i: TemplateInput, ownerId: string | null = null) {
  const v = check(i);
  if (id) {
    if (!(await getDoc("templates", id))) throw notFound("القالب");
    await ref("templates", id).update(v);
    await audit(actorId, "template.update", `templates/${id}`, v);
    return id;
  }
  const r = newRef("templates");
  await r.set({ ...v, id: r.id, ownerId, createdAt: Date.now() } satisfies Template);
  await audit(actorId, "template.create", `templates/${r.id}`, { ...v, ownerId });
  return r.id;
}
