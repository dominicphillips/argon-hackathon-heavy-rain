import type { FC } from "react";
import type { BuildStageId, OrganizationId } from "../types";

export interface ChamberWireframeProps {
  orgId: OrganizationId;
  buildStage: BuildStageId;
}

export const ChamberWireframe: FC<ChamberWireframeProps> = ({
  orgId,
  buildStage,
}) => {
  const stageOpacity =
    buildStage === "queued"
      ? 0.52
      : buildStage === "stage1"
      ? 0.78
      : buildStage === "stage2"
      ? 0.94
      : buildStage === "stage3"
      ? 0.65
      : 0.82;

  if (orgId === "augi") {
    return (
      <div
        className="hr-chamber-wireframe"
        style={{ opacity: stageOpacity }}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 960 360"
          className="hr-chamber-wireframe__svg"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Left Parameter Rail Panel */}
          <g stroke="rgba(226, 232, 240, 0.58)" strokeWidth="1.2">
            <rect x="36" y="28" width="164" height="304" rx="2" fill="rgba(15, 21, 29, 0.46)" />
            <line x1="36" y1="58" x2="200" y2="58" stroke="rgba(226, 232, 240, 0.35)" />
            <rect x="50" y="40" width="64" height="7" rx="1" fill="rgba(226, 232, 240, 0.42)" stroke="none" />
            {/* 3 Parameter Slider Wireframes */}
            <rect x="50" y="76" width="136" height="30" rx="2" />
            <line x1="62" y1="96" x2="174" y2="96" stroke="rgba(52, 211, 153, 0.65)" strokeWidth="2" />
            <circle cx="132" cy="96" r="4" fill="#34D399" stroke="none" />

            <rect x="50" y="122" width="136" height="30" rx="2" />
            <line x1="62" y1="142" x2="174" y2="142" stroke="rgba(226, 232, 240, 0.45)" strokeWidth="2" />
            <circle cx="110" cy="142" r="4" fill="rgba(226, 232, 240, 0.8)" stroke="none" />

            <rect x="50" y="168" width="136" height="30" rx="2" />
            <line x1="62" y1="188" x2="174" y2="188" stroke="rgba(217, 119, 6, 0.72)" strokeWidth="2" />
            <circle cx="148" cy="188" r="4" fill="#F59E0B" stroke="none" />

            {/* Config Toggle Wireframe */}
            <rect x="50" y="218" width="42" height="22" rx="2" />
            <rect x="97" y="218" width="42" height="22" rx="2" stroke="rgba(52, 211, 153, 0.8)" />
            <rect x="144" y="218" width="42" height="22" rx="2" />
          </g>

          {/* Center 3D Skateboard Chassis Orthographic Wireframe */}
          <g stroke="rgba(226, 232, 240, 0.62)" strokeWidth="1.25">
            <rect x="222" y="28" width="386" height="304" rx="2" fill="rgba(15, 21, 29, 0.42)" />
            <line x1="222" y1="58" x2="608" y2="58" stroke="rgba(226, 232, 240, 0.35)" />
            <rect x="238" y="40" width="96" height="7" rx="1" fill="rgba(226, 232, 240, 0.42)" stroke="none" />

            {/* Isometric Skateboard Spaceframe */}
            {/* Outer Sill Rails */}
            <polygon
              points="290,152 435,108 552,166 407,210"
              fill="rgba(52, 211, 153, 0.06)"
              stroke="rgba(226, 232, 240, 0.78)"
              strokeWidth="1.5"
            />
            <polygon
              points="290,166 435,122 552,180 407,224"
              fill="none"
              stroke="rgba(226, 232, 240, 0.42)"
            />
            {/* Battery Cross-Members */}
            <line x1="326" y1="141" x2="443" y2="199" stroke="rgba(52, 211, 153, 0.62)" />
            <line x1="362" y1="130" x2="479" y2="188" stroke="rgba(52, 211, 153, 0.62)" />
            <line x1="398" y1="119" x2="515" y2="177" stroke="rgba(52, 211, 153, 0.62)" />

            {/* Front Megacasting Subframe & Towers */}
            <polygon
              points="252,174 290,152 332,173 294,195"
              fill="rgba(217, 119, 6, 0.14)"
              stroke="rgba(245, 158, 11, 0.85)"
            />
            <line x1="268" y1="172" x2="268" y2="136" stroke="#F59E0B" strokeWidth="1.6" />
            <line x1="306" y1="190" x2="306" y2="154" stroke="#F59E0B" strokeWidth="1.6" />

            {/* Rear Megacasting Subframe & Towers */}
            <polygon
              points="510,145 548,123 584,141 546,163"
              fill="rgba(52, 211, 153, 0.12)"
              stroke="rgba(52, 211, 153, 0.85)"
            />
            <line x1="528" y1="142" x2="528" y2="108" stroke="#34D399" strokeWidth="1.6" />
            <line x1="564" y1="158" x2="564" y2="124" stroke="#34D399" strokeWidth="1.6" />

            {/* Datum Axis Lines */}
            <line
              x1="244"
              y1="268"
              x2="586"
              y2="268"
              stroke="rgba(226, 232, 240, 0.28)"
              strokeDasharray="4 4"
            />
          </g>

          {/* Right Comparative Matrix Wireframe */}
          <g stroke="rgba(226, 232, 240, 0.58)" strokeWidth="1.2">
            <rect x="630" y="28" width="294" height="304" rx="2" fill="rgba(15, 21, 29, 0.46)" />
            <line x1="630" y1="58" x2="924" y2="58" stroke="rgba(226, 232, 240, 0.35)" />
            <rect x="646" y="40" width="84" height="7" rx="1" fill="rgba(226, 232, 240, 0.42)" stroke="none" />
            <rect x="646" y="74" width="262" height="238" rx="1" />
            {[102, 130, 158, 186, 214, 242, 270, 294].map((y) => (
              <line
                key={y}
                x1="646"
                y1={y}
                x2="908"
                y2={y}
                stroke="rgba(226, 232, 240, 0.28)"
              />
            ))}
            {[738, 796, 852].map((x) => (
              <line
                key={x}
                x1={x}
                y1="74"
                x2={x}
                y2="312"
                stroke="rgba(226, 232, 240, 0.28)"
              />
            ))}
          </g>
        </svg>
      </div>
    );
  }

  // Rookmere Capital 3-panel architectural wireframe matching 03-system-c.png exactly
  return (
    <div
      className="hr-chamber-wireframe"
      style={{ opacity: stageOpacity }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 960 360"
        className="hr-chamber-wireframe__svg"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Panel 1: Left Filter Rail (matching 03-system-c.png left panel) */}
        <g stroke="rgba(226, 232, 240, 0.62)" strokeWidth="1.2">
          <rect
            x="48"
            y="26"
            width="136"
            height="308"
            rx="2"
            fill="rgba(16, 21, 28, 0.44)"
          />
          <line x1="48" y1="58" x2="184" y2="58" stroke="rgba(226, 232, 240, 0.38)" />
          <rect
            x="60"
            y="38"
            width="50"
            height="7"
            rx="1"
            fill="rgba(226, 232, 240, 0.48)"
            stroke="none"
          />

          {/* Filter control 1 with funnel icon */}
          <rect x="60" y="72" width="38" height="5" rx="1" fill="rgba(226, 232, 240, 0.36)" stroke="none" />
          <rect x="60" y="84" width="112" height="24" rx="2" />
          <polygon
            points="68,91 78,91 74,96 74,101 72,101 72,96"
            stroke="rgba(226, 232, 240, 0.68)"
            strokeWidth="1.1"
            fill="none"
          />
          <rect x="84" y="93" width="38" height="6" rx="1" fill="rgba(226, 232, 240, 0.44)" stroke="none" />

          {/* Filter control 2 */}
          <rect x="60" y="122" width="32" height="5" rx="1" fill="rgba(226, 232, 240, 0.36)" stroke="none" />
          <circle cx="63" cy="133" r="2" fill="rgba(226, 232, 240, 0.44)" stroke="none" />
          <rect x="70" y="131" width="34" height="5" rx="1" fill="rgba(226, 232, 240, 0.36)" stroke="none" />
          <rect x="60" y="142" width="112" height="24" rx="2" />
          <rect x="68" y="150" width="8" height="8" rx="1" stroke="rgba(226, 232, 240, 0.65)" />
          <rect x="84" y="151" width="38" height="6" rx="1" fill="rgba(226, 232, 240, 0.44)" stroke="none" />

          {/* Filter control 3 */}
          <circle cx="63" cy="182" r="2" fill="rgba(226, 232, 240, 0.44)" stroke="none" />
          <rect x="70" y="180" width="34" height="5" rx="1" fill="rgba(226, 232, 240, 0.36)" stroke="none" />
          <rect x="60" y="191" width="112" height="24" rx="2" />
          <rect x="68" y="199" width="8" height="8" rx="1" stroke="rgba(226, 232, 240, 0.65)" />
          <rect x="84" y="200" width="38" height="6" rx="1" fill="rgba(226, 232, 240, 0.44)" stroke="none" />
        </g>

        {/* Panel 2: Center Variance Waterfall Chart (matching 03-system-c.png middle panel) */}
        <g stroke="rgba(226, 232, 240, 0.62)" strokeWidth="1.2">
          <rect
            x="202"
            y="26"
            width="318"
            height="308"
            rx="2"
            fill="rgba(16, 21, 28, 0.44)"
          />
          <line x1="202" y1="58" x2="520" y2="58" stroke="rgba(226, 232, 240, 0.38)" />
          <rect
            x="218"
            y="38"
            width="92"
            height="7"
            rx="1"
            fill="rgba(226, 232, 240, 0.48)"
            stroke="none"
          />

          {/* Vertical axis and horizontal zero-baseline */}
          <line x1="226" y1="88" x2="226" y2="306" stroke="rgba(226, 232, 240, 0.42)" />
          <line x1="226" y1="228" x2="500" y2="228" stroke="rgba(226, 232, 240, 0.42)" />

          {/* Waterfall bars matching 03-system-c.png */}
          <rect
            x="238"
            y="228"
            width="24"
            height="58"
            fill="rgba(226, 232, 240, 0.14)"
            stroke="rgba(226, 232, 240, 0.78)"
          />
          <rect
            x="274"
            y="186"
            width="24"
            height="42"
            fill="rgba(226, 232, 240, 0.14)"
            stroke="rgba(226, 232, 240, 0.78)"
          />
          <rect
            x="308"
            y="186"
            width="24"
            height="42"
            fill="rgba(226, 232, 240, 0.22)"
            stroke="rgba(226, 232, 240, 0.78)"
          />
          <rect
            x="338"
            y="168"
            width="24"
            height="14"
            fill="rgba(226, 232, 240, 0.14)"
            stroke="rgba(226, 232, 240, 0.78)"
          />
          <rect
            x="370"
            y="156"
            width="24"
            height="12"
            fill="rgba(226, 232, 240, 0.14)"
            stroke="rgba(226, 232, 240, 0.78)"
          />
          <rect
            x="404"
            y="118"
            width="24"
            height="38"
            fill="rgba(226, 232, 240, 0.12)"
            stroke="rgba(226, 232, 240, 0.82)"
          />
          <rect
            x="438"
            y="118"
            width="24"
            height="110"
            fill="rgba(226, 232, 240, 0.26)"
            stroke="rgba(226, 232, 240, 0.82)"
          />
          <rect
            x="472"
            y="228"
            width="24"
            height="40"
            fill="rgba(226, 232, 240, 0.12)"
            stroke="rgba(226, 232, 240, 0.82)"
          />
        </g>

        {/* Panel 3: Right Multi-Row Financial Ledger Grid (matching 03-system-c.png right panel) */}
        <g stroke="rgba(226, 232, 240, 0.62)" strokeWidth="1.2">
          <rect
            x="538"
            y="26"
            width="374"
            height="308"
            rx="2"
            fill="rgba(16, 21, 28, 0.44)"
          />
          <line x1="538" y1="58" x2="912" y2="58" stroke="rgba(226, 232, 240, 0.38)" />
          <rect
            x="554"
            y="38"
            width="86"
            height="7"
            rx="1"
            fill="rgba(226, 232, 240, 0.48)"
            stroke="none"
          />

          {/* Inner Table Frame */}
          <rect x="554" y="76" width="342" height="238" rx="1" />
          {/* Header Row Fill */}
          <rect
            x="555"
            y="77"
            width="340"
            height="24"
            fill="rgba(226, 232, 240, 0.12)"
            stroke="none"
          />

          {/* Horizontal Row Dividers */}
          {[101, 125, 149, 173, 197, 221, 245, 269, 293].map((y, idx) => (
            <g key={y}>
              <line
                x1="554"
                y1={y}
                x2="896"
                y2={y}
                stroke="rgba(226, 232, 240, 0.34)"
              />
              {/* Row label stub in first column */}
              <rect
                x="564"
                y={y + 8}
                width={idx % 2 === 0 ? 74 : 56}
                height="6"
                rx="1"
                fill="rgba(226, 232, 240, 0.42)"
                stroke="none"
              />
            </g>
          ))}

          {/* Column Header Stubs */}
          {[682, 738, 794, 850].map((x) => (
            <rect
              key={x}
              x={x}
              y="86"
              width="24"
              height="5"
              rx="1"
              fill="rgba(226, 232, 240, 0.44)"
              stroke="none"
            />
          ))}

          {/* Vertical Column Dividers */}
          {[666, 724, 782, 838].map((x) => (
            <line
              key={x}
              x1={x}
              y1="76"
              x2={x}
              y2="314"
              stroke="rgba(226, 232, 240, 0.34)"
            />
          ))}
        </g>
      </svg>
    </div>
  );
};
