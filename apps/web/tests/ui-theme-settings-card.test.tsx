import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UiThemeSettingsCard } from "../src/features/ui-theme/UiThemeSettingsCard.js";

describe("UiThemeSettingsCard", () => {
  it.each(["classic", "codex", "motion"] as const)("changes icon packs while preserving the %s theme", (theme) => {
    const onChange = vi.fn();
    render(<UiThemeSettingsCard currentAppearance="dark" currentIconPack="lucide" currentTheme={theme} onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Icon pack" }), { target: { value: "material-rounded" } });
    expect(onChange).toHaveBeenCalledWith({ theme, appearance: "dark", background: "spaceapp", iconPack: "material-rounded" });
    expect(screen.getByRole("option", { name: "Codex LB" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Motion" })).toBeTruthy();
  });

  it("enables icon packs in Classic while keeping its fixed dark appearance", () => {
    render(
      <UiThemeSettingsCard
        currentAppearance="system"
        currentIconPack="lucide"
        currentTheme="classic"
        onChange={vi.fn()}
      />
    );

    expect((screen.getByRole("combobox", { name: "Interface theme" }) as HTMLSelectElement).value).toBe("classic");
    expect((screen.getByRole("combobox", { name: "Modern color mode" }) as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole("combobox", { name: "Icon pack" }) as HTMLSelectElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Apply and reload" })).toBeNull();
  });

  it("requests an immediate reload whenever the interface theme changes", () => {
    const onChange = vi.fn();
    render(
      <UiThemeSettingsCard
        currentAppearance="system"
        currentIconPack="lucide"
        currentTheme="classic"
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Interface theme" }), {
      target: { value: "modern" }
    });

    expect(onChange).toHaveBeenCalledWith({
      appearance: "system",
      background: "spaceapp",
      iconPack: "lucide",
      theme: "modern"
    });
  });

  it("applies Modern color and icon changes independently without a footer action", () => {
    const onChange = vi.fn();
    render(
      <UiThemeSettingsCard
        currentAppearance="dark"
        currentIconPack="lucide"
        currentTheme="modern"
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Modern color mode" }), {
      target: { value: "light" }
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Icon pack" }), {
      target: { value: "material-rounded" }
    });

    expect(onChange).toHaveBeenNthCalledWith(1, {
      appearance: "light",
      background: "spaceapp",
      iconPack: "lucide",
      theme: "modern"
    });
    expect(onChange).toHaveBeenNthCalledWith(2, {
      appearance: "dark",
      background: "spaceapp",
      iconPack: "material-rounded",
      theme: "modern"
    });
  });

  it("allows switching background between SpaceApp and theme default", () => {
    const onChange = vi.fn();
    render(
      <UiThemeSettingsCard
        currentAppearance="dark"
        currentBackground="spaceapp"
        currentIconPack="lucide"
        currentTheme="modern"
        onChange={onChange}
      />
    );

    const select = screen.getByRole("combobox", { name: "Background" }) as HTMLSelectElement;
    expect(select.value).toBe("spaceapp");
    expect(screen.getByRole("option", { name: "SpaceApp" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Theme default (no background)" })).toBeTruthy();

    fireEvent.change(select, { target: { value: "none" } });
    expect(onChange).toHaveBeenCalledWith({
      appearance: "dark",
      background: "none",
      iconPack: "lucide",
      theme: "modern"
    });
  });

  it("brings the Aurora background and icon pack along with the Aurora theme", () => {
    const onChange = vi.fn();
    render(<UiThemeSettingsCard currentAppearance="dark" currentBackground="none" currentIconPack="lucide" currentTheme="modern" onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Interface theme" }), { target: { value: "aurora" } });
    expect(onChange).toHaveBeenCalledWith({ appearance: "dark", background: "aurora", iconPack: "aurora", theme: "aurora" });
  });
});
