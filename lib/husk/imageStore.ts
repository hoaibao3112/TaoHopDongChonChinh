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
 * Lưu ảnh gốc (Blob, File hoặc DataURL) theo mã phiếu (slipId) hoặc tên file.
 */
export async function saveSlipOriginalImage(key: string, data: Blob | File | string): Promise<void> {
  if (!key) return;
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(data, key);
  } catch (err) {
    console.warn('[ImageStore] Không thể lưu ảnh vào IndexedDB:', err);
  }
}

/**
 * Lấy URL ảnh gốc từ IndexedDB để xem phóng to rõ nét 100%.
 */
export async function getSlipOriginalImageUrl(key: string): Promise<string | null> {
  if (!key) return null;
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        const result = req.result;
        if (!result) {
          resolve(null);
        } else if (result instanceof Blob || result instanceof File) {
          resolve(URL.createObjectURL(result));
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
