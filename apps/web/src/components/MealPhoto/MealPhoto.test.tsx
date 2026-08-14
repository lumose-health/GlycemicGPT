import { render, screen, waitFor } from "@testing-library/react";
import { fetchFoodRecordPhotoObjectUrl } from "@/lib/api";
import { MealPhoto } from "./MealPhoto";

jest.mock("@/lib/api", () => ({
  fetchFoodRecordPhotoObjectUrl: jest.fn(),
}));

const mockFetchPhoto =
  fetchFoodRecordPhotoObjectUrl as jest.MockedFunction<
    typeof fetchFoodRecordPhotoObjectUrl
  >;

describe("MealPhoto", () => {
  beforeEach(() => {
    mockFetchPhoto.mockReset();
  });

  it("keeps a placeholder visible when the photo cannot load", async () => {
    mockFetchPhoto.mockRejectedValue(new Error("Unavailable"));
    render(<MealPhoto recordId="meal-1" />);

    expect(screen.getByTestId("meal-photo-placeholder")).toBeInTheDocument();
    await waitFor(() => expect(mockFetchPhoto).toHaveBeenCalledWith("meal-1"));
  });

  it("renders the credentialed photo when it loads", async () => {
    mockFetchPhoto.mockResolvedValue("blob:meal-photo");
    render(<MealPhoto recordId="meal-1" />);

    expect(await screen.findByAltText("Meal photo")).toHaveAttribute(
      "src",
      "blob:meal-photo",
    );
  });
});
