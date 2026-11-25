# Quy Tắc Bắt Buộc Đọc Skill Trước Khi Code

Trước khi viết mới, chỉnh sửa code, thiết kế giao diện, viết test hoặc deploy trong dự án này, AI **BẮT BUỘC** phải kiểm tra và đọc `SKILL.md` của các skill phù hợp trong `C:\Users\ADMIN\.gemini\config\skills\` (hoặc danh sách `<skills>` đã nạp):

## Bản Đồ Skill Bắt Buộc Theo Tác Vụ

1. **Làm tính năng mới / tác vụ lớn (> 5 phút hoặc nhiều file)**:
   - Đọc `brainstorming/SKILL.md` và `planning/SKILL.md` (hoặc `fullstack-workflow-master/SKILL.md`) để nắm rõ quy trình trước khi code.
2. **Backend, API Route, Bảo mật (JWT/Cookie/Auth), Database, Kiến trúc**:
   - Đọc `cau-truc-production-master/SKILL.md`, `ChuanProduction/SKILL.md`, và `nextjs-fullstack/SKILL.md`.
3. **Frontend, React Component, Giao diện (UI/UX), Tailwind**:
   - Đọc `nextjs-frontend/SKILL.md`, `ui-design/SKILL.md`, `react-advanced-patterns/SKILL.md`.
   - Khi kiểm tra/audit chất lượng UI: đọc `ui-audit/SKILL.md`.
   - Khi làm hiệu ứng chuyển động: đọc các skill `gsap-*/SKILL.md` liên quan.
4. **Viết hoặc sửa Unit Test / Integration Test**:
   - Đọc `unit-testing/SKILL.md`.
5. **Review code, dọn dẹp, tối ưu hiệu năng & Deploy**:
   - Đọc `pr-reviewer/SKILL.md`, `tidy/SKILL.md`, `performance-optimization/SKILL.md`.
   - Deploy Vercel/Docker: đọc `vercel-deploy-integration/SKILL.md` hoặc `docker-devops/SKILL.md`.

## Nguyên Tắc Thực Thi
- **Không tự ý bỏ qua skill**: Luôn đọc `SKILL.md` liên quan trước khi bắt đầu sửa code.
- Tuân thủ các checklist chất lượng, bảo mật và cấu trúc trong skill đã đọc.
