function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function getErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Đã xảy ra lỗi. Vui lòng thử lại.";
}

export function isInsufficientCoinsMessage(message: string): boolean {
  const normalized = normalizeForMatch(message);
  return (
    normalized.includes("not enough coins") ||
    normalized.includes("insufficient coins") ||
    normalized.includes("khong du xu") ||
    normalized.includes("khong du tien")
  );
}

export function isInsufficientCoinsError(error: unknown): boolean {
  return isInsufficientCoinsMessage(getErrorMessage(error));
}
