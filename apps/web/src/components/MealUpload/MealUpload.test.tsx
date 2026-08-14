import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { compressImageToJpeg } from "@/lib/image-compress";
import { uploadFoodRecord, type FoodRecord } from "@/lib/api";
import { MealUpload } from "./MealUpload";

jest.mock("@/lib/image-compress", () => ({
  ImageCompressionError: class ImageCompressionError extends Error {},
  compressImageToJpeg: jest.fn(),
}));

jest.mock("@/lib/api", () => ({
  uploadFoodRecord: jest.fn(),
}));

const mockCompress = compressImageToJpeg as jest.MockedFunction<
  typeof compressImageToJpeg
>;
const mockUpload = uploadFoodRecord as jest.MockedFunction<
  typeof uploadFoodRecord
>;

describe("MealUpload", () => {
  it("compresses and uploads the selected photo", async () => {
    const blob = new Blob(["photo"], { type: "image/jpeg" });
    const record = { id: "meal-1" } as FoodRecord;
    const onUploaded = jest.fn();
    mockCompress.mockResolvedValue(blob);
    mockUpload.mockResolvedValue(record);

    render(<MealUpload onUploaded={onUploaded} />);
    const file = new File(["photo"], "meal.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("meal-file-input"), {
      target: { files: [file] },
    });

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(record));
    expect(mockCompress).toHaveBeenCalledWith(file);
    expect(mockUpload).toHaveBeenCalledWith(blob);
  });
});
