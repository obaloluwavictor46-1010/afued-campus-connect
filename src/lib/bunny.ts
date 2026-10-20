const BUNNY_ENDPOINT = import.meta.env.VITE_BUNNY_ENDPOINT;
const BUNNY_PUBLIC_URL = import.meta.env.VITE_BUNNY_PUBLIC_URL;
const BUNNY_ACCESS_KEY = import.meta.env.VITE_BUNNY_ACCESS_KEY;

export const uploadToBunny = async (file: File, folder: string = "videos"): Promise<string> => {
  if (!file) throw new Error("No file selected");

  // New limit: 500MB instead of 30MB
  const MAX_SIZE = 500 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    throw new Error("Video too big (max 500MB)");
  }

  const fileName = `${folder}/${Date.now()}-${file.name.replace(/\s/g, "_")}`;
  const url = `${BUNNY_ENDPOINT}/${fileName}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "AccessKey": BUNNY_ACCESS_KEY,
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bunny upload failed: ${response.status} - ${text}`);
  }

  return `${BUNNY_PUBLIC_URL}/${fileName}`;
};
