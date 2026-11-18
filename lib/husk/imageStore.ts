/**
 * Quản lý lưu trữ ảnh gốc độ phân giải cao của phiếu cân bằng IndexedDB trên trình duyệt.
 * Giúp xem ảnh phóng to sắc nét 100% như camera gốc, không bị mờ do nén thumbnail hay giới hạn dung lượng localStorage.
 */

const DB_NAME = 'HuskSlipImagesDB';
const DB_VERSION = 1;
const STORE_NAME = 'slip_images';

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB không được hỗ trợ trong môi trường này'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Lưu ảnh gốc (Blob, File, ArrayBuffer hoặc DataURL) theo mã phiếu (slipId) hoặc tên file.
 * Tự động chuyển đổi File sang Blob thuần để tương thích 100% với structured clone trên mọi trình duyệt.
 */
export async function saveSlipOriginalImage(key: string, data: Blob | File | ArrayBuffer | string): Promise<void> {
  if (!key || !data) return;
  try {
    let toStore: Blob | string;

    if (typeof File !== 'undefined' && data instanceof File) {
      try {
        const buffer = await data.arrayBuffer();
        toStore = new Blob([buffer], { type: data.type || 'image/jpeg' });
      } catch {
        toStore = data;
      }
    } else if (data instanceof ArrayBuffer) {
      toStore = new Blob([data], { type: 'image/jpeg' });
    } else {
      toStore = data as Blob | string;
    }

    const db = await getDB();
    return new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        console.warn('[ImageStore] Lỗi transaction IndexedDB khi lưu key:', key, tx.error);
        resolve();
      };
      tx.onabort = () => resolve();

      try {
        tx.objectStore(STORE_NAME).put(toStore, key);
      } catch (putErr) {
        console.warn('[ImageStore] Lỗi put IndexedDB:', putErr);
        resolve();
      }
    });
  } catch (err) {
    console.warn('[ImageStore] Không thể lưu ảnh vào IndexedDB:', err);
  }
}

/**
 * Lấy URL ảnh gốc từ IndexedDB theo key (slipId hoặc fileName).
 */
export async function getSlipOriginalImageUrl(key: string): Promise<string | null> {
  if (!key) return null;
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      tx.onerror = () => resolve(null);
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        const result = req.result;
        if (!result) {
          resolve(null);
        } else if (result instanceof Blob || (typeof File !== 'undefined' && result instanceof File)) {
          resolve(URL.createObjectURL(result));
        } else if (result instanceof ArrayBuffer) {
          resolve(URL.createObjectURL(new Blob([result], { type: 'image/jpeg' })));
        } else if (typeof result === 'string') {
          resolve(result);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Tìm và lấy URL ảnh gốc từ danh sách các keys dự phòng (id, fileName, fileName lowercase).
 */
export async function getSlipOriginalImageUrlWithFallback(keys: (string | undefined | null)[]): Promise<string | null> {
  const validKeys = keys.filter((k): k is string => Boolean(k && k.trim()));
  for (const k of validKeys) {
    const url = await getSlipOriginalImageUrl(k);
    if (url) return url;
  }
  return null;
}

/**
 * Xóa ảnh trong IndexedDB khi xóa phiếu.
 */
export async function deleteSlipOriginalImage(key: string): Promise<void> {
  if (!key) return;
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
  } catch (err) {
    console.warn('[ImageStore] Không thể xóa ảnh trong IndexedDB:', err);
  }
}

/**
 * Xóa toàn bộ ảnh khi làm mới đợt quét.
 */
export async function clearAllSlipImages(): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch (err) {
    console.warn('[ImageStore] Không thể xóa toàn bộ ảnh trong IndexedDB:', err);
  }
}
