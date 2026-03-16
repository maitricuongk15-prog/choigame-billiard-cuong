export type ApkRelease = {
  version: string;
  buildNumber: number;
  releaseDate: string;
  apkUrl: string;
  sizeMb: number;
  minAndroid: string;
  notes: string[];
};

export const apkReleases: ApkRelease[] = [
  {
    version: "1.0.0",
    buildNumber: 1,
    releaseDate: "2026-03-11",
    apkUrl: "https://expo.dev/artifacts/eas/8MQSFUkdTX3qJjyVzoRhTq.apk",
    sizeMb: 83.7,
    minAndroid: "Android 8.0+",
    notes: [
      "C?p nh?t snapshot m?i nh?t c?a game.",
      "?? ??y b?n l?n GitHub v? k?ch ho?t l?i Vercel deploy.",
      "Th?m APK m?i t? EAS build cho Android.",
      "Bao g?m c?c thay ??i g?n ??y v? AI, l? b?n v? HUD.",
    ],
  },
  {
    version: "0.9.0",
    buildNumber: 1,
    releaseDate: "2026-02-26",
    apkUrl: "https://expo.dev/artifacts/eas/4dG93MgNAMRcHC8GaPVh4h.apk",
    sizeMb: 83.7,
    minAndroid: "Android 8.0+",
    notes: [
      "Ra m?t phi?n b?n multiplayer c? b?n.",
      "H? tr? t?o ph?ng, v?o ph?ng theo m? v? ch?i 2 ng??i.",
    ],
  },
];

