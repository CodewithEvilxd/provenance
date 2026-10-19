"use client";

import { useState } from "react";
import Link from "next/link";
import {
  IconGitPr,
  IconUsers,
  IconClock,
  IconSearch,
  IconDatabase,
} from "./icons";

const demo = "/repos/vitejs/vite/pr/23333";
const overview = "/repos/vitejs/vite";
const timeSlider = "/repos/vitejs/vite/time";
const askDemo =
  "/repos/vitejs/vite/ask?functionId=fn%3Apackages%2Fvite%2Fsrc%2Fnode%2Fconfig.ts%23resolveConfig";

function LeftWing() {
  return (
    <div className="notch-wing notch-wing-left">
      <svg className="wing-accent-line" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="41" x2="100%" y2="41" stroke="currentColor" strokeWidth="2" />
      </svg>
    </div>
  );
}

function RightWing() {
  return (
    <div className="notch-wing notch-wing-right">
      <svg className="wing-accent-line" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="41" x2="100%" y2="41" stroke="currentColor" strokeWidth="2" />
      </svg>
    </div>
  );
}

function LeftCornerSlice() {
  return (
    <div className="notch-corner-slice notch-corner-left" aria-hidden="true">
      <svg viewBox="0 0 50 66" preserveAspectRatio="none" className="corner-svg">
        <path d="M0,0 L50,0 L50,66 C25,66 25,41 0,41 Z" fill="var(--paper)" />
        <path
          d="M0,41 C25,41 25,65 50,65"
          stroke="var(--ink)"
          strokeWidth="2"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

function RightCornerSlice() {
  return (
    <div className="notch-corner-slice notch-corner-right" aria-hidden="true">
      <svg viewBox="0 0 50 66" preserveAspectRatio="none" className="corner-svg">
        <path d="M0,0 L50,0 L50,41 C25,41 25,66 0,66 Z" fill="var(--paper)" />
        <path
          d="M0,65 C25,65 25,41 50,41"
          stroke="var(--ink)"
          strokeWidth="2"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

function CenterNavLeft() {
  return (
    <nav className="notch-nav-group notch-nav-left" aria-label="Primary navigation left">
      <Link href={demo} className="notch-nav-link">
        <IconGitPr size={14} />
        <span>Review</span>
      </Link>
      <Link href={overview} className="notch-nav-link">
        <IconUsers size={14} />
        <span>Bus Factor</span>
      </Link>
      <Link href={timeSlider} className="notch-nav-link">
        <IconClock size={14} />
        <span>Time Slider</span>
      </Link>
    </nav>
  );
}

function CenterNavRight() {
  return (
    <nav className="notch-nav-group notch-nav-right" aria-label="Primary navigation right">
      <Link href={askDemo} className="notch-nav-link">
        <IconSearch size={14} />
        <span>Ask</span>
      </Link>
      <Link href="/repos" className="notch-nav-link">
        <IconDatabase size={14} />
        <span>Repos</span>
      </Link>
      <span className="tactile-chip chip-lime notch-status-pill">
        <span className="pulse-dot" /> ACTIVE
      </span>
    </nav>
  );
}

function CenterBrand() {
  return (
    <div className="notch-brand-wrap">
      <Link className="brand" href="/" aria-label="Provenance home">
        <span className="brand-mark" aria-hidden="true">
          <i />
          <i />
        </span>
        <span>provenance</span>
      </Link>
    </div>
  );
}

function MobileDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;
  return (
    <div className="notch-mobile-drawer" role="dialog" aria-label="Mobile Navigation">
      <div className="mobile-drawer-inner">
        <div className="mobile-drawer-grid">
          <Link href={demo} onClick={onClose} className="button button-lime">
            <IconGitPr size={15} /> PR #23333 Review
          </Link>
          <Link href={overview} onClick={onClose} className="button button-paper">
            <IconUsers size={15} /> Bus Factor &amp; Ownership
          </Link>
          <Link href={timeSlider} onClick={onClose} className="button button-paper">
            <IconClock size={15} /> Historical Time Slider
          </Link>
          <Link href={askDemo} onClick={onClose} className="button button-paper">
            <IconSearch size={15} /> Ask Graph Memory
          </Link>
          <Link href="/repos" onClick={onClose} className="button button-paper">
            <IconDatabase size={15} /> Repositories
          </Link>
        </div>
      </div>
    </div>
  );
}

export function NotchNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="notch-navbar-shell" aria-label="Main Site Navigation">
      <div className="notch-navbar-bar">
        <LeftWing />
        <LeftCornerSlice />
        <div className="notch-center-slice">
          <button
            type="button"
            className="notch-mobile-toggle"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            <span className="toggle-bar" />
            <span className="toggle-bar" />
          </button>
          <CenterNavLeft />
          <CenterBrand />
          <CenterNavRight />
        </div>
        <RightCornerSlice />
        <RightWing />
      </div>
      <MobileDrawer isOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
    </header>
  );
}
