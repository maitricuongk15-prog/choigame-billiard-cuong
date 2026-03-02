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
    releaseDate: "2026-03-01",
    apkUrl: "https://expo.dev/artifacts/eas/r4Gq9kp56Qwb4PQMwRZ355.apk",
    sizeMb: 83.7,
    minAndroid: "Android 8.0+",
    notes: [
      "Thêm hệ thống xu và cửa hàng gậy.",
      "Thêm chế độ đặt cược theo phòng.",
      "Thêm nhiệm vụ hằng ngày nhận xu.",
      "Cải thiện đồng bộ kết quả trận và tiến độ nhiệm vụ.",
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
      "Ra mắt phiên bản multiplayer cơ bản.",
      "Hỗ trợ tạo phòng, vào phòng theo mã, chơi 2 người.",
    ],
  },
];

