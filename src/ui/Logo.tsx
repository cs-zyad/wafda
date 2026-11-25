import { brand } from "@/config/brand";

/** الشعار: زاويتا إطار المسح + علامة التأكيد */
export function Mark({ size = 32, bg = brand.colors.plum, fg = brand.colors.lime, tick = brand.colors.ivory }: { size?: number; bg?: string; fg?: string; tick?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="12" fill={bg} />
      <path d="M11 20v-7a2 2 0 0 1 2-2h7M37 28v7a2 2 0 0 1-2 2h-7" fill="none" stroke={fg} strokeWidth="4" strokeLinecap="round" />
      <path d="M16.5 24.5l5 5 10-11" fill="none" stroke={tick} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export const Logo = ({ light }: { light?: boolean }) => (
  <span className="logo">
    <Mark size={30} bg={light ? brand.colors.lime : brand.colors.plum} fg={light ? brand.colors.plum : brand.colors.lime} tick={light ? brand.colors.plum : brand.colors.ivory} />
    <span>
      <b>{brand.nameAr}</b>
      <i>{brand.nameEn}</i>
    </span>
  </span>
);
