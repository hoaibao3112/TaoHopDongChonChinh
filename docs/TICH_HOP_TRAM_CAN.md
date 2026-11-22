# TÀI LIỆU THIẾT KẾ & TÍCH HỢP TRẠM CÂN ĐIỆN TỬ VÀO WEB APP

> **Mục đích tài liệu:** Lưu trữ giải pháp kỹ thuật, quy trình nghiệp vụ và phương án triển khai tích hợp trạm cân xe tải / cân ghe (nông sản, lúa gạo, lò sấy) trực tiếp vào Web App (Next.js / TypeScript).

---

## 1. TỔNG QUAN BÀI TOÁN & NGHIỆP VỤ THỰC TẾ

Khách hàng hoạt động trong lĩnh vực **Thu mua, Vận tải & Sấy Nông sản (Lúa gạo/bắp)** với các yêu cầu đặc thù:

### 1.1. Phương tiện cân
- **Tài xế / Xe tải:** Cân xe đường bộ.
- **Tài ghe / Sà lan:** Cân ghe đường thủy.

### 1.2. Nghiệp vụ "Quản lý Tài" (Chống hư hàng)
- Nông sản tươi (lúa ướt) thu hoạch từ ruộng nếu để trên xe/ghe quá 12–24h không đưa vào lò sấy kịp thời sẽ bị nóng, lên men, hư hỏng hạt.
- **Yêu cầu phần mềm:** 
  - Quản lý hàng đợi vào bến theo thứ tự tài (First In - First Out).
  - Có đồng hồ đếm thời gian chờ của từng ghe/xe để cảnh báo tài nào sắp quá hạn cần ưu tiên sấy trước.

### 1.3. Phân luồng dòng hàng
- **Vác bến NSX (Tăng bo):** Hàng bốc dỡ trung chuyển giữa ghe và xe để chuyển tiếp đi nơi khác $\rightarrow$ Xuất phiếu cân điều chuyển.
- **Nhập sấy tại chỗ NSX:** Hàng đưa thẳng vào các lò sấy nội bộ hoặc điều phối sang các điểm lò sấy vệ tinh $\rightarrow$ Xuất phiếu cân nhập kho sấy, gắn mã mẻ sấy/lò sấy.

### 1.4. Quy trình Cân 2 lần (Chống gian lận)
1. **Lần 1 - Cân tổng (Gross Weight):** Xe/ghe đầy hàng lên bàn cân $\rightarrow$ Lấy số Kg tổng.
2. **Lần 2 - Cân bì (Tare Weight):** Sau khi bốc hàng xuống lò, xe/ghe quay lại cân xác không $\rightarrow$ Lấy số Kg bì.
3. **Phần mềm tự tính khối lượng hàng thực tế:**
   $$\text{Khối lượng Tịnh (Net)} = \text{Khối lượng Tổng} - \text{Khối lượng Bì}$$
4. **Khóa ô nhập số:** Nhân viên không được phép gõ tay số Kg (chống thông đồng gian lận), số cân chỉ được phép nhảy tự động từ đầu cân truyền vào.

---

## 2. KIẾN TRÚC KẾT NỐI PHẦN CỨNG & DÒNG CHẢY DỮ LIỆU

```
[BÀN CÂN XE / GHE]
        │
        ▼ (Tín hiệu Loadcell)
[ĐẦU HIỂN THỊ CÂN (Indicator)] ─── (Cổng RS-232 / DB9)
                                          │
                                          ▼ (Cáp chuyển USB-to-RS232)
                                 [MÁY TÍNH PHÒNG CÂN]
                                          │
                          ┌───────────────┴───────────────┐
                          ▼                               ▼
                 [Phương án 1 - Khuyên dùng]       [Phương án 2]
                 Trình duyệt Chrome / Edge         App Service ngầm
                 (Web Serial API đọc trực tiếp)    (WebSocket Localhost)
                          │                               │
                          └───────────────┬───────────────┘
                                          ▼
                               [WEB APP (Next.js)]
                                 ├── Tự nhảy số Kg thời gian thực
                                 ├── Bấm "Lưu & In phiếu"
                                 └── Gửi dữ liệu về Database Cloud
                                          │
                          ┌───────────────┴───────────────┐
                          ▼                               ▼
                 [MÁY IN TẠI PHÒNG CÂN]          [DATABASE & CLOUD]
                 In phiếu cân A5 / Nhiệt         Chủ & Kế toán xem từ xa
```

---

## 3. GIẢI PHÁP KỸ THUẬT CHI TIẾT

### 3.1. Phần cứng kết nối (RS-232 vs USB)
- **Đầu cân:** Hầu hết đầu cân công nghiệp (Yaohua A9, D10, Keli, Kingbird, Mettler Toledo...) dùng chuẩn **RS-232** (cổng COM 9 chân).
- **Cáp kết nối:** Dùng cáp **USB sang RS-232** (chọn loại chip ổn định: **FTDI FT232** hoặc **Prolific PL2303 / CH340**).
- **Đặc điểm:** RS-232 có ốc vặn cố định, chống rung lắc, kéo dây xa 15–30m không bị nhiễu (vượt trội hơn hẳn cáp USB thông thường vốn chỉ kéo được 3–5m). Khi cắm vào máy tính, Windows sẽ nhận thành cổng ảo như `COM1`, `COM3`...

### 3.2. Phương án phần mềm (Code Web App Next.js)

#### Phương án 1: Dùng Web Serial API trực tiếp trên Chrome/Edge (Tối ưu nhất)
- **Ưu điểm:** Không cần cài thêm bất kỳ app .exe nào, mở web trên Chrome là nhận cân.
- **Code mẫu Component (React / TypeScript):**

```tsx
"use client";

import { useState } from "react";

export function TramCanConnector() {
  const [weight, setWeight] = useState<number>(0);
  const [connected, setConnected] = useState<boolean>(false);

  const handleConnectScale = async () => {
    try {
      // 1. Yêu cầu cấp quyền cổng COM/USB Serial từ trình duyệt
      const port = await (navigator as any).serial.requestPort();

      // 2. Mở cổng với thông số chuẩn trạm cân (thường là Baudrate 9600)
      await port.open({
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
      });
      setConnected(true);

      // 3. Đọc dữ liệu stream chuỗi ký tự từ đầu cân
      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();

      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;

        // Xử lý chuỗi khi nhận ký tự kết thúc dòng (\r hoặc \n)
        if (buffer.includes("\n") || buffer.includes("\r")) {
          // Bóc tách số kg từ chuỗi (ví dụ: "ST,GS,+015420kg\r\n")
          const matched = buffer.match(/([+\-]?\d+(\.\d+)?)/);
          if (matched) {
            setWeight(parseFloat(matched[0]));
          }
          buffer = ""; // Xóa buffer cho dòng tiếp theo
        }
      }
    } catch (error) {
      console.error("Lỗi kết nối cổng Serial:", error);
      setConnected(false);
    }
  };

  return (
    <div className="rounded-xl border p-6 bg-white shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">Số Cân Hiện Tại</h3>
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${connected ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
          {connected ? "● Đang nhận tín hiệu" : "○ Chưa kết nối cân"}
        </span>
      </div>

      {/* Hiển thị số kg lớn, khóa không cho nhân viên gõ tay */}
      <div className="text-5xl font-mono font-extrabold text-blue-600 tracking-tight">
        {weight.toLocaleString("vi-VN")} <span className="text-2xl font-normal text-slate-500">Kg</span>
      </div>

      <button
        onClick={handleConnectScale}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition"
      >
        {connected ? "Đã kết nối cổng COM" : "Bấm kết nối bàn cân"}
      </button>
    </div>
  );
}
```

#### Phương án 2: Dùng Service Local nhỏ (Chạy ngầm 24/7)
- Nếu trạm cân cần cắm máy tính tự nhận 100% không cần nhân viên bấm nút trên web:
- Viết 1 file chạy ngầm nhỏ (`bridge.exe` bằng Node.js / C#) đọc cổng COM và phát ra `ws://localhost:8080`.
- Web App chỉ cần lắng nghe `new WebSocket("ws://localhost:8080")`.

---

## 4. CẤU TRÚC DATABASE ĐỀ XUẤT (Prisma Schema)

```prisma
// Bảng lưu phiếu cân trạm cân
model WeighingTicket {
  id              String         @id @default(uuid())
  ticketCode      String         @unique // Mã phiếu: PC-20261122-001
  vehicleType     VehicleType    // TRUCK (Xe tải) | BOAT (Ghe/Sà lan)
  vehicleNumber   String         // Biển số xe hoặc Số hiệu ghe
  driverName      String         // Tên tài xế / tài ghe
  driverPhone     String?

  // Nghiệp vụ nông sản
  productType     String         // Loại lúa: OM5451, Đài Thơm 8, ST25...
  flowType        FlowType       // TANG_BO (Tăng bo bến) | SAY_NOI_BO (Sấy tại chỗ) | SAY_VE_TINH (Sấy gia công)
  dryerStation    String?        // Điểm sấy / Số lò sấy

  // Số liệu cân (đọc tự động từ cổng cân)
  grossWeight     Float?         // Khối lượng tổng lần 1 (Kg)
  tareWeight      Float?         // Khối lượng xác xe/ghe lần 2 (Kg)
  netWeight       Float?         // Khối lượng hàng thực tế (Gross - Tare)
  moisture        Float?         // Độ ẩm lúa (%) nếu có đo

  // Quản lý thứ tự tài
  queueOrder      Int?           // Số thứ tự tài
  timeIn          DateTime       @default(now()) // Giờ xe/ghe vào bến
  timeOut         DateTime?      // Giờ hoàn tất rời bến

  status          TicketStatus   @default(WAITING) // WAITING -> WEIGHED_GROSS -> DRYING -> WEIGHED_TARE -> COMPLETED
  notes           String?
  createdById     String
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  @@index([vehicleNumber])
  @@index([timeIn])
  @@index([status])
}

enum VehicleType {
  TRUCK
  BOAT
}

enum FlowType {
  TANG_BO
  SAY_NOI_BO
  SAY_VE_TINH
}

enum TicketStatus {
  WAITING         // Đang chờ tới tài
  WEIGHED_GROSS   // Đã cân lần 1 (Cân tổng)
  PROCESSING      // Đang bốc dỡ / vào lò sấy
  WEIGHED_TARE    // Đã cân lần 2 (Cân bì)
  COMPLETED       // Hoàn thành phiếu
  CANCELLED
}
```

---

## 5. CHECKLIST 3 ĐIỀU CẦN HỎI KHÁCH HÀNG KHI TRIỂN KHAI

| STT | Câu hỏi cần xác nhận | Mục đích kỹ thuật |
| :---: | :--- | :--- |
| **1** | **Chụp ảnh mặt trước & mặt sau của hộp cân điện tử** | Lấy tên model (ví dụ Yaohua A9, Keli, Kingbird...) để tra cứu chuẩn xác định dạng chuỗi dữ liệu (Data Frame) và tốc độ Baudrate. |
| **2** | **Trạm cân hiện tại đã có dây cắm vào máy tính chưa?** | Xác định xem đã có sẵn cáp RS232-to-USB và driver COM chưa, hay cần trang bị mới cáp nối. |
| **3** | **Loại máy in tại trạm cân đang dùng?** | Thiết kế chuẩn khổ giấy in phiếu cân (A4, A5, hay máy in nhiệt cuộn 80mm K80, hay máy in kim 3 liên Epson). |
