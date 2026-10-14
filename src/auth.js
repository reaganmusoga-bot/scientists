import { uploadToCloudinary } from "./cloudinary.js";

export async function uploadAvatar(uid, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], `avatar-${uid}.jpg`, { type: "image/jpeg" });
  const result = await uploadToCloudinary(file);
  return result.url;
}
