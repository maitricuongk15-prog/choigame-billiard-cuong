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
      "Cap nhat snapshot moi nhat cua game.",
      "Da day ban len GitHub va kich hoat lai Vercel deploy.",
      "Them APK moi tu EAS build cho Android.",
      "Bao gom cac thay doi gan day ve AI, pocket va HUD.",
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
      "Ra mat phien ban multiplayer co ban.",
      "Ho tro tao phong, vao phong theo ma, choi 2 nguoi.",
    ],
  },
];
