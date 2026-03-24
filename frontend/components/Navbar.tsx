"use client"
import Image from 'next/image'
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ConfigPanel from './panels/ConfigPanel';
import { JobsPanel } from './panels/JobsPanel';
import Link from 'next/link';

export default function Navbar() {
    const router = useRouter();
    const [openConfig, setOpenConfig] = useState(false);
    const [openJobs, setOpenJobs] = useState(false);

    const closeConfig = () => setOpenConfig(false);
    const closeJob = () => setOpenJobs(false);

  return (
    <>
     <nav className="border-b border-border px-8 flex items-center justify-between sticky top-0 bg-base/95 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-18 h-18 rounded-lg relative flex items-center justify-center shrink-0">
            <Image src="/logo.png" alt="DevLens" fill className="shrink-0" />
          </div>
          <Link href={"/"} className="font-semibold text-primary text-lg tracking-tight">DevLens</Link>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setOpenConfig(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted 
                       hover:text-primary border border-border hover:border-accent/50
                       rounded-lg bg-elevated transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
              <path d="M12 2v2m0 16v2M2 12h2m16 0h2"/>
            </svg>
            Config
          </button>
          <button
            onClick={() => setOpenJobs(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted
                       hover:text-primary border border-border hover:border-accent/50
                       rounded-lg bg-elevated transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
            </svg>
            Jobs
          </button>
        </div>
      </nav>

      {/* Panels */}
      <ConfigPanel open={openConfig} onClose={closeConfig} />
      {/* JobsPanel */}
      {openJobs && <JobsPanel open={openJobs} onClose={closeJob}/>}
    </>
  );
}