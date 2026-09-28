"use client";

import { useState } from "react";

import styles from "./profile-photo.module.css";

export type ProfileAvatarSize = "small" | "medium" | "large";

function initials(name: string): string {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "AW";
}

/** A decorative participant avatar that always has an initials fallback. */
export function ProfileAvatar({
  name,
  photoUrl,
  size = "medium",
}: {
  name: string;
  photoUrl?: string | null;
  size?: ProfileAvatarSize;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageUrl = photoUrl?.trim() || null;
  const imageFailed = failedUrl === imageUrl;

  return (
    <span className={`${styles.avatar} ${styles[size]}`} aria-hidden="true">
      {imageUrl && !imageFailed ? (
        // Signed private-storage URLs cannot use the Next.js image loader.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" onError={() => setFailedUrl(imageUrl)} />
      ) : (
        <span>{initials(name)}</span>
      )}
    </span>
  );
}
