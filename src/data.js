import { uploadToCloudinary } from "./cloudinary.js";

// Replace the old uploadInnovationMedia function with:
async function uploadInnovationMedia(itemId, mediaArray) {
  const uploaded = [];
  for (const m of mediaArray) {
    // m.data is base64 data URL from the file input
    const blob = await (await fetch(m.data)).blob();
    const file = new File([blob], m.name, { type: m.type });
    const result = await uploadToCloudinary(file);
    uploaded.push({
      url: result.url,
      publicId: result.publicId,
      name: result.name,
      size: result.size,
      type: result.type,
      provider: "cloudinary"
    });
  }
  return uploaded;
}
