'use client';
import React from "react";
import Sidebar from "@/components/Sidebar";
import LogoutHeader from "@/components/LogoutHeader";

export default function ContentsLayout({ children }: { children: React.ReactNode; }) {
  return (
    <div className="min-h-dvh flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <LogoutHeader />
        <main className="flex-1 p-4">
          {children}
        </main>
      </div>
    </div>
  );
}
