import * as React from "react";
import { SketchPicker } from "react-color";
import { Grid, PathType, PathDirection } from "../";
import { objectValues } from "../lang";
import { ExampleType } from "./exampleData";

export interface Props {
  grid: Required<Grid>;
  onChangeGrid: (g: Required<Grid>) => void;
  gridEnabled: boolean;
  onChangeGridEnabled: (enabled: boolean) => void;
  gridSnapSize: number;
  onChangeGridSnapSize: (size: number) => void;
  pathType: PathType;
  onChangePathType: (type: PathType) => void;
  preferredPathDirection: PathDirection;
  onChangePreferredPathDirection: (direction: PathDirection) => void;
  dropShadows: boolean;
  onChangeDropShadows: (dropShadows: boolean) => void;
  onChangeExampleType: (type: ExampleType) => void;
}

const popover = {
  position: "absolute" as const,
  zIndex: 2,
};
const cover = {
  position: "fixed" as const,
  top: "0px",
  right: "0px",
  bottom: "0px",
  left: "0px",
};

export function ControlStrip(props: Props) {
  const [colorPickerVisible, setColorPickerVisible] = React.useState(false);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center" }}>
        grid enabled
        <input
          type="checkbox"
          checked={props.gridEnabled}
          onChange={() => {
            props.onChangeGridEnabled(!props.gridEnabled);
          }}
        />
        dot size
        <input
          type="number"
          min={1}
          step={0.5}
          max={5}
          value={props.grid.dotSize}
          onChange={(e) => {
            props.onChangeGrid({ ...props.grid, dotSize: +e.currentTarget.value });
          }}
          disabled={!props.gridEnabled}
        />
        dot spacing
        <input
          type="number"
          min={10}
          step={5}
          max={200}
          value={props.grid.spacing}
          onChange={(e) => {
            props.onChangeGrid({ ...props.grid, spacing: +e.currentTarget.value });
          }}
          disabled={!props.gridEnabled}
        />
        <button
          style={{ display: "flex", alignItems: "center" }}
          onClick={() => {
            setColorPickerVisible(true);
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              backgroundColor: props.grid.fill,
              border: "1px solid darkgrey",
              marginRight: 4,
            }}
          />
          dot color
        </button>
        snap to grid
        <input
          type="number"
          step={10}
          min={0}
          max={200}
          value={props.gridSnapSize}
          onChange={(e) => {
            props.onChangeGridSnapSize(+e.currentTarget.value);
          }}
          disabled={!props.gridEnabled}
        />
        <select
          onChange={(e) => {
            props.onChangePathType(e.currentTarget.value as PathType);
          }}
          value={props.pathType}
        >
          {objectValues(PathType).map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        drop shadows
        <input
          type="checkbox"
          checked={props.dropShadows}
          onChange={() => {
            props.onChangeDropShadows(!props.dropShadows);
          }}
        />
        <select
          onChange={(e) => {
            props.onChangePreferredPathDirection(e.currentTarget.value as PathDirection);
          }}
          value={props.preferredPathDirection}
        >
          {objectValues(PathDirection).map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select
          onChange={(e) => {
            props.onChangeExampleType(e.currentTarget.value as ExampleType);
          }}
          value=""
        >
          <option value="">~ generate a graph ~</option>
          {objectValues(ExampleType).map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      {colorPickerVisible && (
        <div style={popover}>
          <div
            style={cover}
            onClick={() => {
              setColorPickerVisible(false);
            }}
          />
          <SketchPicker
            disableAlpha
            color={props.grid.fill}
            onChange={(color) => {
              props.onChangeGrid({ ...props.grid, fill: color.hex });
            }}
          />
        </div>
      )}
    </div>
  );
}
