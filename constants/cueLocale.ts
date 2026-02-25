import type { CueRow } from "../types/cue";

type CueLike = Pick<CueRow, "slug" | "name" | "description"> | null | undefined;

const CUE_NAME_VI: Record<string, string> = {
  starter: "Gậy khởi đầu",
  "oak-pro": "Gậy sồi chuyên nghiệp",
  "carbon-x": "Gậy carbon X",
  phoenix: "Gậy phượng hoàng",
  "viper-strike": "Gậy viper strike",
  "aurora-balance": "Gậy aurora cân bằng",
  "titanium-z": "Gậy titanium Z",
  "nebula-elite": "Gậy nebula tinh anh",
};

const CUE_DESC_VI: Record<string, string> = {
  starter: "Gậy cơ bản cân bằng, phù hợp người mới.",
  "oak-pro": "Ổn định và kiểm soát tốt cho cú đánh chính xác.",
  "carbon-x": "Lực mạnh, kiểm soát vừa, phù hợp lối đánh tấn công.",
  phoenix: "Gậy cao cấp toàn diện cho người chơi có kinh nghiệm.",
  "viper-strike": "Xoáy cao và tốc độ tốt cho kỹ thuật nâng cao.",
  "aurora-balance": "Cân bằng tốt giữa ngắm, lực và kiểm soát.",
  "titanium-z": "Thiên về lực cực mạnh, tạo va chạm nặng.",
  "nebula-elite": "Gậy tinh anh chỉ số hỗn hợp rất cao.",
};

export function getCueNameVi(cue: CueLike): string {
  if (!cue) return "Gậy cơ bản";
  return CUE_NAME_VI[cue.slug] || cue.name || "Gậy cơ bản";
}

export function getCueDescriptionVi(cue: CueLike): string {
  if (!cue) return "Chưa có mô tả";
  return CUE_DESC_VI[cue.slug] || cue.description || "Chưa có mô tả";
}
