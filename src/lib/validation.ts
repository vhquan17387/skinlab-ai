import { z } from "zod";
import {
  SKIN_CONCERN_VALUES,
  SUBMISSION_STATUSES,
  IMAGE_KINDS,
} from "@/lib/constants";

// /submit personal info + concerns + consent.
// Files are validated separately (multipart) in the route handler.
export const submitSchema = z.object({
  full_name: z.string().trim().min(2, "Họ tên phải có ít nhất 2 ký tự"),
  email: z.string().trim().email("Email không hợp lệ"),
  phone: z
    .string()
    .trim()
    .min(8, "Số điện thoại phải có ít nhất 8 chữ số")
    .optional()
    .or(z.literal("")),
  age: z.coerce
    .number()
    .int()
    .min(10, "Tuổi phải từ 10 trở lên")
    .max(100, "Tuổi phải từ 100 trở xuống"),
  gender: z.enum(["female", "male", "other"]),
  skin_concerns: z
    .array(z.enum(SKIN_CONCERN_VALUES as [string, ...string[]]))
    .min(1, "Vui lòng chọn ít nhất một vấn đề về da"),
  notes_from_user: z
    .string()
    .max(2000, "Ghi chú tối đa 2000 ký tự")
    .optional()
    .or(z.literal("")),
  consent_terms: z.literal(true, {
    errorMap: () => ({ message: "Bạn cần đồng ý điều khoản sử dụng" }),
  }),
  consent_data: z.literal(true, {
    errorMap: () => ({ message: "Bạn cần đồng ý xử lý dữ liệu" }),
  }),
  consent_images: z.literal(true, {
    errorMap: () => ({ message: "Bạn cần đồng ý cung cấp hình ảnh" }),
  }),
});

export type SubmitInput = z.infer<typeof submitSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email("Email không hợp lệ"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

export const statusUpdateSchema = z.object({
  status: z.enum(SUBMISSION_STATUSES),
});

export const noteCreateSchema = z.object({
  body: z.string().trim().min(1, "Ghi chú không được để trống").max(5000),
});

export const imageKindSchema = z.enum(IMAGE_KINDS);
