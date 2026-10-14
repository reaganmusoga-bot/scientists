/* ============================================================
   Cloudinary upload helper
   Free-tier storage for innovation media and user avatars.
   ============================================================ */

const CLOUD_NAME = "gvuie3rn";
const UPLOAD_PRESET = "scipool unsigned";

export async function uploadToCloudinary(file, onProgress) {
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText);
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            name: file.name,
            size: file.size,
            type: file.type,
            provider: "cloudinary"
          });
        } catch (e) {
          reject(new Error("Invalid response from Cloudinary"));
        }
      } else {
        reject(new Error("Upload failed (" + xhr.status + "): " + xhr.responseText));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(formData);
  });
}
